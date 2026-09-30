import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import ts from "typescript";
function load(path, modules = {}, env = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    URL,
    Date,
    Intl,
    Error,
    crypto: { randomUUID },
    process: { env },
    require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected import ${name}`);
      return modules[name];
    },
  });
  return exports;
}
const training = load("lib/training.ts");
const set = (weight = 75, reps = 8) => ({
  id: randomUUID(),
  weight_kg: weight,
  reps,
  duration_seconds: null,
  distance_km: null,
});
test("sets validate all exercise types, reject partial/negative/impossible values and preserve empty sets", () => {
  assert.equal(training.validateSet(set(), "weight_reps").weight_kg, 75);
  assert.equal(training.validateSet(set(null, 10), "bodyweight_reps").reps, 10);
  assert.equal(training.validateSet(set(90, 30), "reps").weight_kg, null);
  assert.equal(
    training.validateSet({ ...set(null, null), duration_seconds: 90 }, "time")
      .duration_seconds,
    90,
  );
  assert.equal(
    training.validateSet(
      { ...set(null, null), distance_km: 3, duration_seconds: 1200 },
      "distance_time",
    ).distance_km,
    3,
  );
  assert.equal(training.validateSet(set(null, null), "weight_reps").reps, null);
  for (const bad of [
    set(-1, 8),
    set(75, null),
    set(75, 1.5),
    set(2000, 8),
    set(75, 0),
    set(75, Infinity),
  ])
    assert.throws(() => training.validateSet(bad, "weight_reps"));
});
test("statistics ignore empty sets; bodyweight uses external load only; Epley is restricted", () => {
  const workout = {
    started_at: "2026-09-01T10:00:00Z",
    ended_at: "2026-09-01T11:00:00Z",
    exercises: [
      {
        exercise: { result_type: "weight_reps" },
        sets: [set(60, 12), set(70, 10), set(null, null)],
      },
      {
        exercise: { result_type: "bodyweight_reps" },
        sets: [set(null, 10), set(10, 5)],
      },
    ],
  };
  const stats = training.workoutStats(workout);
  assert.equal(stats.volume, 1470);
  assert.equal(stats.sets, 4);
  assert.equal(stats.reps, 37);
  assert.equal(stats.duration, 60);
  assert.equal(training.estimatedOneRepMax(100, 6, "weight_reps"), 120);
  assert.equal(training.estimatedOneRepMax(100, 1, "weight_reps"), 100);
  assert.equal(training.estimatedOneRepMax(100, 20, "weight_reps"), null);
  assert.equal(training.estimatedOneRepMax(10, 6, "bodyweight_reps"), null);
});
test("exercise and measurement validation handles extensible categories and empty/invalid fields", () => {
  assert.equal(
    training.validateExercise({
      name: "Squat",
      category: "Olympic lifts",
      result_type: "weight_reps",
      active: true,
    }).category,
    "Olympic lifts",
  );
  assert.throws(() =>
    training.validateExercise({
      name: "",
      category: "Legs",
      result_type: "weight_reps",
      active: true,
    }),
  );
  assert.throws(() =>
    training.validateExercise({
      name: "A",
      category: "Legs",
      result_type: "toString",
      active: true,
    }),
  );
  assert.equal(training.validDate("2024-02-29"), "2024-02-29");
  assert.throws(() => training.validDate("2026-02-29"));
  const input = {
    id: randomUUID(),
    measured_on: "2026-09-01",
    weight_kg: 90.2,
  };
  assert.equal(training.validateMeasurement(input).waist_cm, null);
  assert.throws(() =>
    training.validateMeasurement({ ...input, weight_kg: null }),
  );
  assert.throws(() =>
    training.validateMeasurement({ ...input, weight_kg: -1 }),
  );
});
test("authentication fails closed for anonymous, wrong owner and missing configuration", async () => {
  for (const [user, env, status] of [
    [null, { TRAIN_USER_ID: "owner" }, 401],
    [{ id: "other" }, { TRAIN_USER_ID: "owner" }, 403],
    [{ id: "owner" }, {}, 503],
  ]) {
    const auth = load(
      "lib/trainingAuth.ts",
      {
        "@/lib/training": training,
        "@/lib/serverAuth": {
          requireAuthenticatedUser: async () => {
            if (!user) throw new Error("Unauthorized");
            return user;
          },
        },
      },
      env,
    );
    await assert.rejects(
      () => auth.requireTrainingUser({}),
      (error) => error.status === status,
    );
  }
});
test("all API methods check authorization before touching storage and return private headers", async () => {
  let touched = false;
  const route = load("app/api/train/route.ts", {
    "@/lib/training": training,
    "@/lib/trainingAuth": {
      requireTrainingUser: async () => {
        throw new training.TrainingError("Denied", 403);
      },
    },
    "@/lib/supabaseAdmin": {
      supabaseAdmin: {
        from() {
          touched = true;
          throw new Error("Unexpected storage access");
        },
      },
    },
    "@/lib/localDate": { getLocalDateString: () => "2026-09-30" },
    "next/server": {
      NextResponse: { json: (data, init) => ({ data, ...init }) },
    },
  });
  for (const method of ["GET", "POST", "DELETE"]) {
    const result = await route[method]({});
    assert.equal(result.status, 403);
    assert.match(result.headers["Cache-Control"], /no-store/);
    assert.equal(result.headers["X-Robots-Tag"], "noindex, nofollow");
  }
  assert.equal(touched, false);
});
test("SQL and HTML privacy configuration excludes every training route", () => {
  const schema = readFileSync(
    new URL("../supabase/training_schema.sql", import.meta.url),
    "utf8",
  );
  assert.match(schema, /enable row level security/);
  assert.match(schema, /revoke all on public\.%I from anon, authenticated/);
  assert.match(schema, /unique\(owner_user_id,workout_date\)/);
  const layout = readFileSync(
    new URL("../app/train/layout.tsx", import.meta.url),
    "utf8",
  );
  assert.match(layout, /index:\s*false,\s*follow:\s*false/);
  const robots = load("app/robots.ts");
  assert.ok(robots.default().rules.disallow.includes("/train"));
});

test("workout API validates owned exercises and uses one atomic save with server owner", async () => {
  const owner = randomUUID(), exerciseId = randomUUID(), workoutId = randomUUID();
  const exercise = { id: exerciseId, active: true, result_type: "weight_reps" };
  const calls = [], queries = [];
  let rpcError = null;
  const db = {
    from(table) {
      const query = { table, filters: [] }; queries.push(query);
      const chain = {
        select() { return chain; },
        eq(key, value) { query.filters.push([key,value]); return chain; },
        in() { return chain; },
        single() { return Promise.resolve({ data: { id: workoutId, exercises: [] }, error: null }); },
        then(resolve) { return Promise.resolve({data:[exercise],error:null}).then(resolve); },
      };
      return chain;
    },
    async rpc(name,args) { calls.push({name,args}); return {data:1,error:rpcError}; },
  };
  const route=load("app/api/train/route.ts",{
    "@/lib/training":training,
    "@/lib/trainingAuth":{requireTrainingUser:async()=>({id:owner})},
    "@/lib/supabaseAdmin":{supabaseAdmin:db},
    "@/lib/localDate":{getLocalDateString:()=>"2026-09-30"},
    "next/server":{NextResponse:{json:(data,init)=>({data,...init})}},
  });
  const workout={id:workoutId,revision:0,workout_date:"2026-09-29",title:"Push",notes:"",started_at:null,ended_at:null,exercises:[{id:randomUUID(),exercise_id:exerciseId,notes:"",sets:[set(75,8),set(70,10)]}]};
  const send=(w=workout)=>route.POST({text:async()=>JSON.stringify({action:"workout",owner_user_id:"attacker",workout:w})});
  assert.equal((await send()).status,200);
  assert.equal(calls.length,1);assert.equal(calls[0].name,"train_save");assert.equal(calls[0].args.p_owner,owner);
  assert.equal(calls[0].args.p_workout.exercises[0].sets.length,2);
  assert.ok(queries.every(q=>q.filters.some(([key,value])=>key==="owner_user_id"&&value===owner)));
  const bad=structuredClone(workout);bad.exercises[0].sets[0].reps=null;
  assert.equal((await send(bad)).status,400);assert.equal(calls.length,1);
  const duplicate=structuredClone(workout);duplicate.exercises.push(duplicate.exercises[0]);
  assert.equal((await send(duplicate)).status,400);assert.equal(calls.length,1);
  exercise.active=false;assert.equal((await send()).status,400);assert.equal(calls.length,1);
  exercise.active=true;rpcError={code:"40001"};assert.equal((await send()).status,409);
});
