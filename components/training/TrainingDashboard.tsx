"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocalToday } from "@/lib/useLocalToday";
import type { Exercise, PersonalRecord, WorkoutSummary } from "@/lib/training";
import {
  useTrainingAction,
  useTrainingQuery,
  trainingRequest,
} from "./trainingClient";
import styles from "./training.module.css";
type Dashboard = {
  workouts: WorkoutSummary[];
  monthCount: number;
  weight: { weight_kg: number; measured_on: string } | null;
  records: PersonalRecord[];
  recentExercises: Exercise[];
};
export default function TrainingDashboard() {
  const today = useLocalToday(),
    router = useRouter(),
    { data, error, loading, reload } = useTrainingQuery<Dashboard>(
      `today=${today}`,
    ),
    action = useTrainingAction();
  const todayWorkout = data?.workouts.find((w) => w.workout_date === today);
  async function start() {
    await action.run(async () => {
      const result = await trainingRequest<{ id: string }>("", {
        action: "start",
        date: today,
        started_at: new Date().toISOString(),
      });
      router.push(`/train/workouts/${result.id}`);
    });
  }
  return (
    <>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>
            {today} / {todayWorkout ? "TRAINING DAY" : "REST DAY"}
          </p>
          <h1>Your next rep starts here.</h1>
          <p className={styles.muted}>
            Small steps. Steady progress. Your pace.
          </p>
        </div>
      </div>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>MAKE TIME FOR YOU</span>
          <h2>
            {todayWorkout
              ? "Ready to pick up where you left off?"
              : "Let’s get a session in."}
          </h2>
          <p>Log your sets and keep your last performance close.</p>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.primary}
            disabled={action.busy || loading || !!error}
            onClick={() => void start()}
          >
            {action.busy
              ? "Opening…"
              : todayWorkout
                ? "Open Today’s Workout"
                : "Training Today"}
          </button>
          <Link className={styles.button} href="/train/exercises?new=1">
            + Add Exercise
          </Link>
        </div>
      </div>
      {(error || action.error) && (
        <p role="alert" className={styles.error}>
          {error || action.error}{" "}
          {error && <button onClick={reload}>Retry</button>}
        </p>
      )}
      {loading ? (
        <p className={styles.muted}>Loading your training summary…</p>
      ) : (
        data && (
          <>
            <div className={styles.stats}>
              <div>
                <span>Last workout</span>
                <strong>{data.workouts[0]?.workout_date ?? "Not yet"}</strong>
              </div>
              <div>
                <span>This month</span>
                <strong>
                  {data.monthCount} <small>workouts</small>
                </strong>
              </div>
              <div>
                <span>Latest weight</span>
                <strong>
                  {data.weight ? `${data.weight.weight_kg} kg` : "—"}
                </strong>
                <small>{data.weight?.measured_on}</small>
              </div>
            </div>
            <div className={styles.columns}>
              <section className={styles.card}>
                <div className={styles.sectionHeading}>
                  <h2>Recent sessions</h2>
                  <Link href="/train/history">View all →</Link>
                </div>
                {!data.workouts.length && (
                  <p className={styles.empty}>
                    Your first workout is a fresh start. Tap Training Today to
                    begin.
                  </p>
                )}
                {data.workouts.map((w) => (
                  <Link
                    className={styles.listRow}
                    href={`/train/workouts/${w.id}`}
                    key={w.id}
                  >
                    <span>
                      <b>{w.title || "Workout"}</b>
                      <small>{w.workout_date}</small>
                    </span>
                    <span>Open →</span>
                  </Link>
                ))}
              </section>
              <section className={styles.card}>
                <div className={styles.sectionHeading}>
                  <h2>Personal records</h2>
                  <span className={styles.badge}>AUTO TRACKED</span>
                </div>
                {!data.records.length && (
                  <p className={styles.empty}>
                    Save your first sets to establish a baseline. New bests
                    appear here automatically.
                  </p>
                )}
                {data.records.slice(0, 5).map((r, i) => (
                  <Link
                    href={`/train/exercises/${r.exercise_id}`}
                    className={styles.listRow}
                    key={i}
                  >
                    <span>
                      <b>{r.name}</b>
                      <small>
                        {r.metric} · {r.workout_date}
                      </small>
                    </span>
                    <strong className={styles.accent}>
                      {Number(r.value).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                  </Link>
                ))}
              </section>
            </div>
            <section className={styles.card}>
              <div className={styles.sectionHeading}>
                <h2>Recently used</h2>
                <Link href="/train/exercises">Exercise library →</Link>
              </div>
              <div className={styles.actions}>
                {Array.from(
                  new Map(data.recentExercises.map((e) => [e.id, e])).values(),
                )
                  .slice(0, 8)
                  .map((e) => (
                    <Link
                      className={styles.button}
                      href={`/train/exercises/${e.id}`}
                      key={e.id}
                    >
                      {e.name}
                    </Link>
                  ))}
                {!data.recentExercises.length && (
                  <p className={styles.muted}>
                    Your go-to exercises will appear here.
                  </p>
                )}
              </div>
            </section>
          </>
        )
      )}
    </>
  );
}
