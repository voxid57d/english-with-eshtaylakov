"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  emptySet,
  fieldsFor,
  formatSet,
  workoutStats,
  type Exercise,
  type PersonalRecord,
  type SessionExercise,
  type TrainingSet,
  type Workout,
} from "@/lib/training";
import { useLocalToday } from "@/lib/useLocalToday";
import {
  trainingRequest,
  useTrainingAction,
  useTrainingDirty,
  useTrainingQuery,
} from "./trainingClient";
import { ExercisePicker } from "./ExerciseLibrary";
import styles from "./training.module.css";
type Previous = { workout_date: string; sets: TrainingSet[] } | null;
type Payload = {
  workout: Workout;
  previous: Record<string, Previous>;
  records: PersonalRecord[];
};
const fieldLabels = {
  weight_kg: "Weight (kg)",
  reps: "Reps",
  duration_seconds: "Time (seconds)",
  distance_km: "Distance (km)",
};
function localTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export default function WorkoutEditor({ id }: { id: string }) {
  const query = useTrainingQuery<Payload>(`view=workout&id=${id}`);
  if (query.error)
    return (
      <p className={styles.error} role="alert">
        {query.error} <button onClick={query.reload}>Retry</button>
      </p>
    );
  if (!query.data || query.loading) return <p>Loading workout…</p>;
  return <Editor initial={query.data} reload={query.reload} />;
}
function Editor({ initial, reload }: { initial: Payload; reload: () => void }) {
  const [workout, setWorkout] = useState(initial.workout),
    [previous, setPrevious] = useState(initial.previous),
    [dirty, setDirty] = useState(false),
    [picker, setPicker] = useState(false),
    [message, setMessage] = useState("");
  const action = useTrainingAction(),
    router = useRouter(),
    today = useLocalToday();
  useTrainingDirty(dirty);
  const stats = workoutStats(workout);
  function change(values: Partial<Workout>) {
    setWorkout((w) => ({ ...w, ...values }));
    setDirty(true);
    setMessage("");
  }
  function changeExercise(id: string, values: Partial<SessionExercise>) {
    change({
      exercises: workout.exercises.map((e) =>
        e.id === id ? { ...e, ...values } : e,
      ),
    });
  }
  function changeSet(
    item: SessionExercise,
    id: string,
    values: Partial<TrainingSet>,
  ) {
    changeExercise(item.id, {
      sets: item.sets.map((s) => (s.id === id ? { ...s, ...values } : s)),
    });
  }
  async function addExercise(exercise: Exercise) {
    if (workout.exercises.some((e) => e.exercise_id === exercise.id)) {
      setPicker(false);
      return;
    }
    await action.run(async () => {
      const reference = await trainingRequest<{ previous: Previous }>(
        `view=previous&exercise=${exercise.id}&before=${workout.workout_date}`,
      );
      setPrevious((p) => ({ ...p, [exercise.id]: reference.previous }));
      change({
        exercises: [
          ...workout.exercises,
          {
            id: crypto.randomUUID(),
            exercise_id: exercise.id,
            exercise,
            notes: "",
            sets: [emptySet()],
          },
        ],
      });
      setPicker(false);
    });
  }
  async function save(finish = false) {
    await action.run(async () => {
      const payload = finish
        ? { ...workout, ended_at: new Date().toISOString() }
        : workout;
      const result = await trainingRequest<{ revision: number }>("", {
        action: "workout",
        workout: payload,
      });
      setWorkout({ ...payload, revision: result.revision });
      setDirty(false);
      setMessage("Saved to your account.");
      reload();
    });
  }
  function move(index: number, offset: number) {
    const items = [...workout.exercises];
    [items[index], items[index + offset]] = [
      items[index + offset],
      items[index],
    ];
    change({ exercises: items });
  }
  return (
    <>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>
            {workout.workout_date === today ? "TODAY’S SESSION" : "WORKOUT LOG"}{" "}
            / {workout.ended_at ? "FINISHED" : "IN PROGRESS"}
          </p>
          <h1>{workout.title || "Your workout"}</h1>
          <p className={styles.muted}>
            {workout.workout_date} · {stats.exercises} exercises · {stats.sets}{" "}
            recorded sets · {stats.reps} reps · {stats.volume.toLocaleString()}{" "}
            kg volume{stats.duration !== null ? ` · ${stats.duration} min` : ""}
          </p>
        </div>
        <Link className={styles.button} href="/train/history">
          History
        </Link>
      </div>
      <fieldset disabled={action.busy}>
        <details className={styles.card}>
          <summary>Session details & notes</summary>
          <div className={styles.formGrid} style={{ marginTop: 18 }}>
            <label>
              Date
              <input
                type="date"
                value={workout.workout_date}
                required
                onChange={(e) => change({ workout_date: e.target.value })}
              />
            </label>
            <label>
              Title (optional)
              <input
                maxLength={100}
                value={workout.title}
                placeholder="Push, Pull, Legs…"
                onChange={(e) => change({ title: e.target.value })}
              />
            </label>
            <label>
              Started
              <input
                type="datetime-local"
                value={localTime(workout.started_at)}
                onChange={(e) =>
                  change({
                    started_at: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
              />
            </label>
            <label>
              Finished
              <input
                type="datetime-local"
                value={localTime(workout.ended_at)}
                onChange={(e) =>
                  change({
                    ended_at: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
              />
            </label>
            <label>
              Workout notes
              <textarea
                maxLength={2000}
                value={workout.notes}
                onChange={(e) => change({ notes: e.target.value })}
              />
            </label>
          </div>
        </details>
        {workout.exercises.map((item, index) => {
          const reference = previous[item.exercise_id];
          return (
            <section key={item.id} className={styles.card}>
              <div className={styles.sectionHeading}>
                <div>
                  <h2>
                    <Link href={`/train/exercises/${item.exercise_id}`}>
                      {index + 1}. {item.exercise.name}
                    </Link>
                  </h2>
                  <span className={styles.muted}>{item.exercise.category}</span>
                </div>
                <div className={styles.actions}>
                  <button
                    aria-label={`Move ${item.exercise.name} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Move ${item.exercise.name} down`}
                    disabled={index === workout.exercises.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Remove ${item.exercise.name} and its sets from this workout?`,
                        )
                      )
                        change({
                          exercises: workout.exercises.filter(
                            (e) => e.id !== item.id,
                          ),
                        });
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className={styles.reference}>
                {reference ? (
                  <>
                    <b>Previous · {reference.workout_date}</b>
                    <p>
                      {reference.sets
                        .map((s) => formatSet(s, item.exercise.result_type))
                        .join(" / ") || "No sets recorded"}
                    </p>
                  </>
                ) : (
                  "Your first session with this exercise. Set a starting point."
                )}
              </div>
              {item.sets.map((set, setIndex) => (
                <div className={styles.setRow} key={set.id}>
                  <span className={styles.setNumber}>{setIndex + 1}</span>
                  <div>
                    <div className={styles.setInputs}>
                      {fieldsFor(item.exercise.result_type).map((field) => (
                        <label key={field}>
                          {field === "weight_kg" &&
                          item.exercise.result_type === "bodyweight_reps"
                            ? "Extra kg (optional)"
                            : fieldLabels[field]}
                          <input
                            aria-label={`${item.exercise.name} set ${setIndex + 1} ${fieldLabels[field]}`}
                            type="number"
                            inputMode={
                              field === "reps" || field === "duration_seconds"
                                ? "numeric"
                                : "decimal"
                            }
                            min={
                              field === "weight_kg"
                                ? 0
                                : field === "distance_km"
                                  ? 0.001
                                  : 1
                            }
                            max={
                              field === "weight_kg"
                                ? 1500
                                : field === "reps"
                                  ? 10000
                                  : field === "distance_km"
                                    ? 1000
                                    : 604800
                            }
                            step={
                              field === "reps" || field === "duration_seconds"
                                ? 1
                                : "any"
                            }
                            value={set[field] ?? ""}
                            placeholder="—"
                            onChange={(e) =>
                              changeSet(item, set.id, {
                                [field]:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    {reference?.sets[setIndex] && (
                      <small className={styles.muted}>
                        Last:{" "}
                        {formatSet(
                          reference.sets[setIndex],
                          item.exercise.result_type,
                        )}
                      </small>
                    )}
                  </div>
                  <button
                    aria-label={`Delete ${item.exercise.name} set ${setIndex + 1}`}
                    onClick={() =>
                      changeExercise(item.id, {
                        sets: item.sets.filter((s) => s.id !== set.id),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className={styles.actions}>
                <button
                  disabled={item.sets.length >= 100}
                  onClick={() =>
                    changeExercise(item.id, {
                      sets: [...item.sets, emptySet()],
                    })
                  }
                >
                  + Add Set
                </button>
                <button
                  disabled={!item.sets.length || item.sets.length >= 100}
                  onClick={() =>
                    changeExercise(item.id, {
                      sets: [
                        ...item.sets,
                        {
                          ...item.sets[item.sets.length - 1],
                          id: crypto.randomUUID(),
                        },
                      ],
                    })
                  }
                >
                  Duplicate Previous Set
                </button>
              </div>
              <details className={styles.notes}>
                <summary>Exercise notes</summary>
                <label>
                  Session notes
                  <textarea
                    maxLength={2000}
                    value={item.notes}
                    onChange={(e) =>
                      changeExercise(item.id, { notes: e.target.value })
                    }
                  />
                </label>
                {item.exercise.notes && (
                  <p className={styles.muted}>
                    Library note: {item.exercise.notes}
                  </p>
                )}
              </details>
            </section>
          );
        })}
        {!workout.exercises.length && (
          <div className={styles.card}>
            <h2>Start with your first exercise.</h2>
            <p className={styles.muted}>
              Choose a movement, then add your sets. Your last session will be
              shown alongside today’s results.
            </p>
          </div>
        )}
        <section className={styles.card}>
          <div className={styles.sectionHeading}>
            <h2>Add to this session</h2>
            <button
              disabled={workout.exercises.length >= 50}
              onClick={() => setPicker(!picker)}
            >
              {picker ? "Close picker" : "+ Add Exercise"}
            </button>
          </div>
          {picker && (
            <ExercisePicker
              recent={workout.exercises.map((e) => e.exercise)}
              onChoose={(e) => void addExercise(e)}
            />
          )}
        </section>
        {!!initial.records.length && !dirty && (
          <section className={styles.card}>
            <h2>Personal records this session</h2>
            <p className={styles.muted}>
              First recorded performances establish a baseline.
            </p>
            {initial.records.map((r, i) => (
              <p key={i} className={styles.success}>
                {r.previous === null ? "Baseline" : "New PR"} · {r.name} ·{" "}
                {r.metric}:{" "}
                {Number(r.value).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </p>
            ))}
          </section>
        )}
        <div className={styles.actions} style={{ marginBottom: 24 }}>
          <button
            disabled={workout.workout_date === today || dirty}
            onClick={() =>
              void action.run(async () => {
                const result = await trainingRequest<{ id: string }>("", {
                  action: "start",
                  date: today,
                  started_at: new Date().toISOString(),
                  repeat: workout.id,
                });
                router.push(`/train/workouts/${result.id}`);
              })
            }
          >
            Repeat Workout Today
          </button>
          <button
            onClick={() => {
              if (
                confirm("Permanently delete this workout and all of its sets?")
              )
                void action.run(async () => {
                  await trainingRequest(
                    "",
                    { action: "workout", id: workout.id },
                    "DELETE",
                  );
                  setDirty(false);
                  router.push("/train/history");
                });
            }}
          >
            Delete workout
          </button>
        </div>
      </fieldset>
      {action.error && (
        <p className={styles.error} role="alert">
          {action.error}{" "}
          <button
            onClick={() => {
              if (!dirty || confirm("Reload and discard unsaved changes?"))
                reload();
            }}
          >
            Reload saved workout
          </button>
        </p>
      )}
      <div className={styles.saveBar}>
        <span className={dirty ? styles.muted : styles.success} role="status">
          {action.busy
            ? "Saving…"
            : dirty
              ? "Unsaved changes"
              : message || "All changes saved"}
        </span>
        <div className={styles.actions}>
          <button
            className={styles.primary}
            disabled={action.busy || !dirty}
            onClick={() => void save()}
          >
            Save workout
          </button>
          {!workout.ended_at && workout.started_at && (
            <button disabled={action.busy} onClick={() => void save(true)}>
              Finish workout
            </button>
          )}
        </div>
      </div>
    </>
  );
}
