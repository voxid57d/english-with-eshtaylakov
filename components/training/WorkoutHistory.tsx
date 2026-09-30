"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocalToday } from "@/lib/useLocalToday";
import {
  formatSet,
  type Exercise,
  type TrainingSet,
  type WorkoutSummary,
} from "@/lib/training";
import {
  trainingRequest,
  useTrainingAction,
  useTrainingQuery,
} from "./trainingClient";
import styles from "./training.module.css";
export function SessionHistory({ exercise }: { exercise?: Exercise }) {
  const [page, setPage] = useState(0),
    { data, error, loading } = useTrainingQuery<{
      workouts: (WorkoutSummary & { exercises?: { sets: TrainingSet[] }[] })[];
      more: boolean;
    }>(
      `view=history&page=${page}${exercise ? `&exercise=${exercise.id}` : ""}`,
    );
  return (
    <section className={styles.card}>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {loading && <p>Loading sessions…</p>}
      {data && !data.workouts.length && (
        <p className={styles.empty}>No sessions yet.</p>
      )}
      {data?.workouts.map((w, index) => (
        <div key={w.id}>
          {(index === 0 ||
            data.workouts[index - 1].workout_date.slice(0, 7) !==
              w.workout_date.slice(0, 7)) && (
            <h2 style={{ marginTop: 18 }}>
              {new Date(`${w.workout_date}T12:00:00`).toLocaleDateString(
                undefined,
                { month: "long", year: "numeric" },
              )}
            </h2>
          )}
          <Link className={styles.listRow} href={`/train/workouts/${w.id}`}>
            <span>
              <b>
                {w.workout_date.slice(8)} · {w.title || "Workout"}
              </b>
              {exercise && (
                <small>
                  {w.exercises?.[0]?.sets
                    .map((s) => formatSet(s, exercise.result_type))
                    .join(" / ")}
                </small>
              )}
            </span>
            <span>Open →</span>
          </Link>
        </div>
      ))}
      <div className={styles.actions} style={{ marginTop: 16 }}>
        {page > 0 && (
          <button onClick={() => setPage((p) => p - 1)}>Newer</button>
        )}
        {data?.more && (
          <button onClick={() => setPage((p) => p + 1)}>Older</button>
        )}
      </div>
    </section>
  );
}
export default function WorkoutHistory() {
  const today = useLocalToday(),
    [date, setDate] = useState(today),
    action = useTrainingAction(),
    router = useRouter();
  return (
    <>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>EVERY SESSION COUNTS</p>
          <h1>Workout history</h1>
          <p className={styles.muted}>
            Revisit your work. See how far you’ve come.
          </p>
        </div>
      </div>
      <form
        className={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            const result = await trainingRequest<{ id: string }>("", {
              action: "start",
              date,
            });
            router.push(`/train/workouts/${result.id}`);
          });
        }}
      >
        <div className={styles.formGrid}>
          <label>
            Log a past workout
            <input
              required
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <div className={styles.actions}>
            <button disabled={action.busy} className={styles.primary}>
              Create / open workout
            </button>
          </div>
        </div>
        {action.error && (
          <p role="alert" className={styles.error}>
            {action.error}
          </p>
        )}
      </form>
      <SessionHistory />
    </>
  );
}
