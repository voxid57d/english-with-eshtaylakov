"use client";
import Link from "next/link";
import {
  RESULT_TYPES,
  type Exercise,
  type PersonalRecord,
} from "@/lib/training";
import { useTrainingQuery } from "./trainingClient";
import { SessionHistory } from "./WorkoutHistory";
import TrainingProgress from "./TrainingProgress";
import styles from "./training.module.css";
export default function ExerciseHistory({ id }: { id: string }) {
  const { data, error, loading } = useTrainingQuery<{
    exercise: Exercise;
    records: PersonalRecord[];
  }>(`view=exercise&id=${id}`);
  if (error)
    return (
      <p role="alert" className={styles.error}>
        {error}
      </p>
    );
  if (loading || !data) return <p>Loading exercise history…</p>;
  return (
    <>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>
            {data.exercise.category} / {RESULT_TYPES[data.exercise.result_type]}
          </p>
          <h1>{data.exercise.name}</h1>
          <p className={styles.muted}>
            {data.exercise.muscle}
            {!data.exercise.active ? " · Archived" : ""}
          </p>
        </div>
        <Link className={styles.button} href="/train/exercises">
          Exercise library
        </Link>
      </div>
      {data.exercise.notes && (
        <p className={styles.muted}>{data.exercise.notes}</p>
      )}
      <TrainingProgress exercise={data.exercise} />
      <section className={styles.card}>
        <h2>Recent personal records</h2>
        {!data.records.length && (
          <p className={styles.empty}>
            Record a session to establish your baseline.
          </p>
        )}
        {data.records.map((r, i) => (
          <p key={i} className={styles.muted}>
            {r.workout_date} · {r.metric}:{" "}
            <b className={styles.accent}>
              {Number(r.value).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </b>
            {r.previous === null ? " (baseline)" : " (new best)"}
          </p>
        ))}
      </section>
      <h2>All sessions</h2>
      <SessionHistory exercise={data.exercise} />
    </>
  );
}
