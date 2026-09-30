import { NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabaseAdmin";
import { requireTrainingUser } from "@/lib/trainingAuth";
import { getLocalDateString } from "@/lib/localDate";
import {
  TrainingError,
  validDate,
  validId,
  textField,
  numeric,
  validateExercise,
  validateMeasurement,
  validateSet,
  type Workout,
  type Exercise,
} from "@/lib/training";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Authorization",
};
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers });
}
function fail(error: unknown) {
  if (error instanceof TrainingError)
    return json({ error: error.message }, error.status);
  return json(
    {
      error:
        "Training storage is unavailable. Check the migration and server configuration.",
    },
    500,
  );
}
function checked<T>(result: {
  data: T;
  error: { code?: string; message?: string } | null;
}): T {
  if (result.error) {
    const code = result.error.code;
    if (code === "23505")
      throw new TrainingError(
        "A record with this name or date already exists.",
        409,
      );
    if (code === "40001")
      throw new TrainingError(
        "This workout changed in another tab. Reload before saving.",
        409,
      );
    if (code === "23503")
      throw new TrainingError(
        "This record is used in workout history. Archive the exercise instead.",
        409,
      );
    if (code === "23514")
      throw new TrainingError(
        "Invalid values, or the result type of an exercise with history was changed.",
      );
    if (code === "P0002" || code === "PGRST116")
      throw new TrainingError("Record not found.", 404);
    throw new Error("Database request failed");
  }
  return result.data;
}
const workoutSelect =
  "*, exercises:train_workout_exercises(*, exercise:train_exercises(*), sets:train_sets(*))";
async function workout(owner: string, id: string): Promise<Workout> {
  const row = checked(
    await db
      .from("train_workouts")
      .select(workoutSelect)
      .eq("owner_user_id", owner)
      .eq("id", id)
      .single(),
  );
  row.exercises.sort(
    (a: { position: number }, b: { position: number }) =>
      a.position - b.position,
  );
  for (const item of row.exercises)
    item.sets.sort(
      (a: { position: number }, b: { position: number }) =>
        a.position - b.position,
    );
  return row as Workout;
}
async function previous(owner: string, exercise: string, before: string) {
  // Empty/repeated sessions must not hide the most recent recorded performance.
  const rows = checked(
    await db
      .from("train_performances")
      .select("workout_id,workout_date")
      .eq("owner_user_id", owner)
      .eq("exercise_id", exercise)
      .lt("workout_date", before)
      .order("workout_date", { ascending: false })
      .limit(1),
  );
  const row = rows?.[0];
  if (!row) return null;
  const item = checked(
    await db
      .from("train_workout_exercises")
      .select("sets:train_sets(*)")
      .eq("owner_user_id", owner)
      .eq("workout_id", row.workout_id)
      .eq("exercise_id", exercise)
      .single(),
  );
  if (!item) return null;
  return {
    workout_date: row.workout_date,
    sets: item.sets.sort(
      (a: { position: number }, b: { position: number }) =>
        a.position - b.position,
    ),
  };
}
function pageNumber(value: string | null) {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 10000)
    throw new TrainingError("Invalid page.");
  return n;
}
export async function GET(req: Request) {
  try {
    const user = await requireTrainingUser(req),
      owner = user.id;
    const p = new URL(req.url).searchParams,
      view = p.get("view") || "dashboard",
      page = pageNumber(p.get("page"));
    if (view === "access") return json({ authorized: true });
    if (view === "recent") {
      const rows =
        checked(
          await db
            .from("train_workout_exercises")
            .select("exercise:train_exercises(*)")
            .eq("owner_user_id", owner)
            .order("created_at", { ascending: false })
            .limit(30),
        ) ?? [];
      return json({ exercises: rows.map((row) => row.exercise) });
    }
    if (view === "exercises") {
      let query = db
        .from("train_exercises")
        .select("*")
        .eq("owner_user_id", owner)
        .order("active", { ascending: false })
        .order("name");
      const search = (p.get("search") ?? "")
        .replace(/[%_,()]/g, " ")
        .trim()
        .slice(0, 100);
      if (search) query = query.ilike("name", `%${search}%`);
      const rows = checked(await query.range(page * 50, page * 50 + 50)) ?? [];
      return json({ exercises: rows.slice(0, 50), more: rows.length > 50 });
    }
    if (view === "exercise") {
      const id = validId(p.get("id"));
      const [exercise, records] = await Promise.all([
        db
          .from("train_exercises")
          .select("*")
          .eq("owner_user_id", owner)
          .eq("id", id)
          .single(),
        db
          .from("train_records")
          .select("*")
          .eq("owner_user_id", owner)
          .eq("exercise_id", id)
          .order("workout_date", { ascending: false })
          .limit(30),
      ]);
      return json({ exercise: checked(exercise), records: checked(records) });
    }
    if (view === "previous")
      return json({
        previous: await previous(
          owner,
          validId(p.get("exercise")),
          validDate(p.get("before")),
        ),
      });
    if (view === "workout") {
      const row = await workout(owner, validId(p.get("id")));
      const references = await Promise.all(
        row.exercises.map(async (item) => [
          item.exercise_id,
          await previous(owner, item.exercise_id, row.workout_date),
        ]),
      );
      const records = checked(
        await db
          .from("train_records")
          .select("*")
          .eq("owner_user_id", owner)
          .eq("workout_id", row.id),
      );
      return json({
        workout: row,
        previous: Object.fromEntries(references),
        records,
      });
    }
    if (view === "history") {
      const exercise = p.get("exercise");
      let query = db
        .from("train_workouts")
        .select(
          exercise
            ? "id,workout_date,title,started_at,ended_at,exercises:train_workout_exercises!inner(exercise_id,sets:train_sets(*))"
            : "id,workout_date,title,started_at,ended_at",
        )
        .eq("owner_user_id", owner);
      if (exercise)
        query = query.eq("exercises.exercise_id", validId(exercise));
      const rows =
        checked(
          await query
            .order("workout_date", { ascending: false })
            .range(page * 20, page * 20 + 20),
        ) ?? [];
      for (const row of rows) {
        if ("exercises" in row && Array.isArray(row.exercises)) {
          for (const item of row.exercises as { sets: { position: number }[] }[]) {
            item.sets.sort((a, b) => a.position - b.position);
          }
        }
      }
      return json({ workouts: rows.slice(0, 20), more: rows.length > 20 });
    }
    if (view === "measurements") {
      const [profile, measurements] = await Promise.all([
        db
          .from("train_profiles")
          .select("birth_year,height_cm")
          .eq("owner_user_id", owner)
          .maybeSingle(),
        db
          .from("train_measurements")
          .select("*")
          .eq("owner_user_id", owner)
          .order("measured_on", { ascending: false })
          .range(page * 30, page * 30 + 30),
      ]);
      const rows = checked(measurements) ?? [];
      return json({
        profile: checked(profile) ?? { birth_year: null, height_cm: null },
        measurements: rows.slice(0, 30),
        more: rows.length > 30,
      });
    }
    if (view === "progress") {
      const from = validDate(p.get("from") || "1900-01-01"),
        to = validDate(p.get("to") || getLocalDateString());
      if (from > to)
        throw new TrainingError("The start date must precede the end date.");
      const exercise = p.get("exercise");
      const [measurements, workouts, performances] = await Promise.all([
        db
          .from("train_measurements")
          .select("*")
          .eq("owner_user_id", owner)
          .gte("measured_on", from)
          .lte("measured_on", to)
          .order("measured_on")
          .range(page * 500, page * 500 + 500),
        db
          .from("train_workouts")
          .select("id,workout_date,title")
          .eq("owner_user_id", owner)
          .gte("workout_date", from)
          .lte("workout_date", to)
          .order("workout_date")
          .range(page * 500, page * 500 + 500),
        exercise
          ? db
              .from("train_performances")
              .select("*")
              .eq("owner_user_id", owner)
              .eq("exercise_id", validId(exercise))
              .gte("workout_date", from)
              .lte("workout_date", to)
              .order("workout_date")
              .range(page * 500, page * 500 + 500)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const m = checked(measurements) ?? [],
        w = checked(workouts) ?? [],
        e = checked(performances) ?? [];
      return json({
        measurements: m.slice(0, 500),
        workouts: w.slice(0, 500),
        performances: e.slice(0, 500),
        more: m.length > 500 || w.length > 500 || e.length > 500,
      });
    }
    if (view !== "dashboard") throw new TrainingError("Unknown view.");
    const today = validDate(p.get("today") || getLocalDateString()),
      month = today.slice(0, 7);
    const [recent, count, weight, records, used] = await Promise.all([
      db
        .from("train_workouts")
        .select("id,workout_date,title,started_at,ended_at")
        .eq("owner_user_id", owner)
        .lte("workout_date", today)
        .order("workout_date", { ascending: false })
        .limit(5),
      db
        .from("train_workouts")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", owner)
        .gte("workout_date", `${month}-01`)
        .lte("workout_date", today),
      db
        .from("train_measurements")
        .select("weight_kg,measured_on")
        .eq("owner_user_id", owner)
        .not("weight_kg", "is", null)
        .lte("measured_on", today)
        .order("measured_on", { ascending: false })
        .limit(1),
      db
        .from("train_records")
        .select("*")
        .eq("owner_user_id", owner)
        .lte("workout_date", today)
        .order("workout_date", { ascending: false })
        .order("name")
        .limit(8),
      db
        .from("train_workout_exercises")
        .select(
          "exercise:train_exercises(*),workout:train_workouts!inner(workout_date)",
        )
        .eq("owner_user_id", owner)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    checked(count);
    return json({
      workouts: checked(recent),
      monthCount: count.count ?? 0,
      weight: (checked(weight) ?? [])[0] ?? null,
      records: checked(records),
      recentExercises: (checked(used) ?? []).map((row) => row.exercise),
    });
  } catch (error) {
    return fail(error);
  }
}
async function body(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > 1_000_000)
    throw new TrainingError("Request too large.", 413);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed;
  } catch {
    throw new TrainingError("Invalid request body.");
  }
}
function timestamp(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new TrainingError("Invalid time.");
  return new Date(value).toISOString();
}
export async function POST(req: Request) {
  try {
    const { id: owner } = await requireTrainingUser(req),
      input = await body(req),
      action = input.action;
    if (action === "start") {
      const id = checked(
        await db.rpc("train_start", {
          p_owner: owner,
          p_date: validDate(input.date),
          p_started: timestamp(input.started_at),
          p_repeat: input.repeat ? validId(input.repeat) : null,
        }),
      );
      return json({ id });
    }
    if (action === "exercise") {
      const exercise = validateExercise(input),
        id = validId(input.id);
      const existing = checked(
        await db
          .from("train_exercises")
          .select("id")
          .eq("owner_user_id", owner)
          .eq("id", id)
          .maybeSingle(),
      );
      const result = existing
        ? await db
            .from("train_exercises")
            .update(exercise)
            .eq("owner_user_id", owner)
            .eq("id", id)
            .select("*")
            .single()
        : await db
            .from("train_exercises")
            .insert({ ...exercise, id, owner_user_id: owner })
            .select("*")
            .single();
      return json({ exercise: checked(result) });
    }
    if (action === "workout") {
      const row = input.workout as Workout;
      if (!row || !Array.isArray(row.exercises) || row.exercises.length > 50)
        throw new TrainingError("A workout supports up to 50 exercises.");
      validId(row.id);
      validDate(row.workout_date);
      if (!Number.isInteger(row.revision) || row.revision < 0)
        throw new TrainingError("Invalid revision.");
      const ids = row.exercises.map((item) => validId(item.exercise_id));
      if (new Set(ids).size !== ids.length)
        throw new TrainingError(
          "Each exercise can appear only once per workout.",
        );
      const exercises: Exercise[] = ids.length
        ? (checked(
            await db
              .from("train_exercises")
              .select("*")
              .eq("owner_user_id", owner)
              .in("id", ids),
          ) ?? [])
        : [];
      const existing = await workout(owner, row.id);
      const seen = new Set<string>();
      const items = row.exercises.map((item) => {
        validId(item.id);
        if (seen.has(item.id))
          throw new TrainingError("Duplicate exercise ID.");
        seen.add(item.id);
        const exercise = exercises.find((e) => e.id === item.exercise_id);
        if (
          !exercise ||
          (!exercise.active &&
            !existing.exercises.some((e) => e.exercise_id === exercise.id))
        )
          throw new TrainingError("Choose an active exercise.");
        if (!Array.isArray(item.sets) || item.sets.length > 100)
          throw new TrainingError("An exercise supports up to 100 sets.");
        const sets = item.sets.map((set) => {
          const result = validateSet(set, exercise.result_type);
          if (seen.has(result.id)) throw new TrainingError("Duplicate set ID.");
          seen.add(result.id);
          return result;
        });
        return {
          id: item.id,
          exercise_id: item.exercise_id,
          notes: textField(item.notes),
          sets,
        };
      });
      const started = timestamp(row.started_at),
        ended = timestamp(row.ended_at);
      if (ended && (!started || ended < started))
        throw new TrainingError("End time must follow start time.");
      const revision = checked(
        await db.rpc("train_save", {
          p_owner: owner,
          p_workout: {
            id: row.id,
            revision: row.revision,
            workout_date: row.workout_date,
            title: textField(row.title, 100),
            notes: textField(row.notes),
            started_at: started,
            ended_at: ended,
            exercises: items,
          },
        }),
      );
      return json({ revision });
    }
    if (action === "measurement") {
      const values = validateMeasurement(input);
      const existing = checked(
        await db
          .from("train_measurements")
          .select("id")
          .eq("owner_user_id", owner)
          .eq("id", values.id)
          .maybeSingle(),
      );
      checked(
        existing
          ? await db
              .from("train_measurements")
              .update(values)
              .eq("owner_user_id", owner)
              .eq("id", values.id)
          : await db
              .from("train_measurements")
              .insert({ ...values, owner_user_id: owner }),
      );
      return json({ id: values.id });
    }
    if (action === "profile") {
      checked(
        await db
          .from("train_profiles")
          .upsert(
            {
              owner_user_id: owner,
              birth_year: numeric(
                input.birth_year,
                "Birth year",
                new Date().getFullYear(),
                1900,
                true,
              ),
              height_cm: numeric(input.height_cm, "Height", 300, 50),
            },
            { onConflict: "owner_user_id" },
          ),
      );
      return json({ saved: true });
    }
    throw new TrainingError("Unknown action.");
  } catch (error) {
    return fail(error);
  }
}
export async function DELETE(req: Request) {
  try {
    const { id: owner } = await requireTrainingUser(req),
      input = await body(req),
      id = validId(input.id);
    if (input.action === "exercise") {
      const used = checked(
        await db
          .from("train_workout_exercises")
          .select("id")
          .eq("owner_user_id", owner)
          .eq("exercise_id", id)
          .limit(1),
      );
      if (used?.length) {
        checked(
          await db
            .from("train_exercises")
            .update({ active: false })
            .eq("owner_user_id", owner)
            .eq("id", id),
        );
        return json({ archived: true });
      }
      checked(
        await db
          .from("train_exercises")
          .delete()
          .eq("owner_user_id", owner)
          .eq("id", id),
      );
    } else if (input.action === "workout" || input.action === "measurement") {
      checked(
        await db
          .from(
            input.action === "workout"
              ? "train_workouts"
              : "train_measurements",
          )
          .delete()
          .eq("owner_user_id", owner)
          .eq("id", id),
      );
    } else throw new TrainingError("Unknown action.");
    return json({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
