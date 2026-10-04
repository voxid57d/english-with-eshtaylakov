"use client";

import CalendarInput from "@/components/ui/CalendarInput";
import { useState } from "react";
import Link from "next/link";
import { useLocalToday } from "@/lib/useLocalToday";
import {
  MEASUREMENTS,
  type Exercise,
  type Measurement,
  type MeasurementKey,
  type Performance,
  type WorkoutSummary,
} from "@/lib/training";
import { useTrainingQuery } from "./trainingClient";
import { ExercisePicker } from "./ExerciseLibrary";
import TrainingChart from "./TrainingChart";
import styles from "./training.module.css";
type Progress = {
  measurements: Measurement[];
  workouts: WorkoutSummary[];
  performances: Performance[];
  more: boolean;
};
const METRICS = {
  max_weight: { label: "Maximum weight", unit: "kg" },
  estimated_1rm: { label: "Estimated 1RM", unit: "kg" },
  volume: { label: "Session volume", unit: "kg × reps" },
  reps: { label: "Total reps", unit: "reps" },
  duration: { label: "Longest set duration", unit: "sec" },
  distance: { label: "Longest set distance", unit: "km" },
};
type Metric = keyof typeof METRICS;
function metricsFor(exercise: Exercise): Metric[] {
  return exercise.result_type === "weight_reps"
    ? ["max_weight", "estimated_1rm", "volume", "reps"]
    : exercise.result_type === "bodyweight_reps"
      ? ["reps", "max_weight", "volume"]
      : exercise.result_type === "reps"
        ? ["reps"]
        : exercise.result_type === "time"
          ? ["duration"]
          : ["distance", "duration"];
}
export default function TrainingProgress({
  exercise: fixedExercise,
}: {
  exercise?: Exercise;
}) {
  const today = useLocalToday(),
    [range, setRange] = useState("3"),
    [measurement, setMeasurement] = useState<MeasurementKey>("weight_kg"),
    [selected, setSelected] = useState<Exercise | null>(null),
    [choose, setChoose] = useState(false),
    [metric, setMetric] = useState<Metric>("max_weight"),
    [page, setPage] = useState(0),
    [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7));
  const exercise = fixedExercise ?? selected;
  const start = new Date(`${today}T12:00:00Z`);
  if (range !== "all") {
    const day = start.getUTCDate();
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - Number(range));
    const last = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    ).getUTCDate();
    start.setUTCDate(Math.min(day, last));
  }
  const from =
    range === "all" ? "1900-01-01" : start.toISOString().slice(0, 10);
  const { data, error, loading } = useTrainingQuery<Progress>(
    `view=progress&from=${from}&to=${today}&page=${page}${exercise ? `&exercise=${exercise.id}` : ""}`,
  );
  const available = exercise ? metricsFor(exercise) : [],
    selectedMetric = available.includes(metric)
      ? metric
      : (available[0] ?? "reps");
  const calendar = useTrainingQuery<{ workouts: WorkoutSummary[] }>(
    `view=progress&from=${calendarMonth}-01&to=${calendarMonth}-${new Date(Number(calendarMonth.slice(0, 4)), Number(calendarMonth.slice(5, 7)), 0).getDate()}`,
  );
  const days = new Date(
      Number(calendarMonth.slice(0, 4)),
      Number(calendarMonth.slice(5, 7)),
      0,
    ).getDate(),
    offset = (new Date(`${calendarMonth}-01T12:00:00`).getDay() + 6) % 7;
  function counts(period: "week" | "month") {
    const totals = new Map<string, number>();
    // Include zero-session periods so gaps in consistency remain visible.
    const first = data?.workouts[0]?.workout_date;
    const begin = range === "all" ? (first ?? today) : from,
      end =
        page > 0 || data?.more
          ? (data?.workouts.at(-1)?.workout_date ?? today)
          : today;
    for (
      let day = new Date(`${begin}T12:00:00Z`);
      day.toISOString().slice(0, 10) <= end;
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      const bucket = new Date(day);
      if (period === "week")
        bucket.setUTCDate(bucket.getUTCDate() - ((bucket.getUTCDay() + 6) % 7));
      else bucket.setUTCDate(1);
      totals.set(bucket.toISOString().slice(0, 10), 0);
    }
    for (const w of data?.workouts ?? []) {
      const d = new Date(`${w.workout_date}T12:00:00Z`);
      if (period === "week")
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      else d.setUTCDate(1);
      const key = d.toISOString().slice(0, 10);
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    return Array.from(totals, ([date, value]) => ({ date, value }));
  }
  return (
    <>
      {!fixedExercise && (
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>THE BIGGER PICTURE</p>
            <h1>Your progress</h1>
            <p className={styles.muted}>Look back to move forward.</p>
          </div>
        </div>
      )}
      <div className={styles.card}>
        <label>
          Chart period
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value);
              setPage(0);
            }}
          >
            <option value="1">1 month</option>
            <option value="3">3 months</option>
            <option value="6">6 months</option>
            <option value="12">1 year</option>
            <option value="all">All time</option>
          </select>
        </label>
        <p className={styles.muted}>
          {from === "1900-01-01" ? "All recorded dates" : from} – {today}
        </p>
        {page > 0 && (
          <p className={styles.muted}>
            Showing archive page {page + 1}. Each page contains up to 500
            observations per series; boundary week/month counts may be partial.
          </p>
        )}
        {data?.more && (
          <p className={styles.muted}>
            This archive has more than 500 observations. Use Next period below
            to see the next page.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {loading && <p>Loading progress…</p>}
      {!fixedExercise && data && (
        <section className={styles.card}>
          <div className={styles.sectionHeading}>
            <h2>Body measurements</h2>
          </div>
          <label>
            Measurement
            <select
              value={measurement}
              onChange={(e) => setMeasurement(e.target.value as MeasurementKey)}
            >
              {Object.entries(MEASUREMENTS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <TrainingChart
            title={MEASUREMENTS[measurement]}
            unit={measurement === "weight_kg" ? "kg" : "cm"}
            points={data.measurements
              .filter((m) => m[measurement] !== null)
              .map((m) => ({
                date: m.measured_on,
                value: Number(m[measurement]),
              }))}
          />
        </section>
      )}
      <section className={styles.card}>
        <div className={styles.sectionHeading}>
          <h2>{exercise?.name ?? "Exercise progress"}</h2>
          {!fixedExercise && (
            <button onClick={() => setChoose(!choose)}>
              {choose ? "Close" : "Choose exercise"}
            </button>
          )}
        </div>
        {choose && (
          <ExercisePicker
            onChoose={(e) => {
              setSelected(e);
              setChoose(false);
              setPage(0);
            }}
          />
        )}
        {exercise ? (
          <>
            <label>
              Metric
              <select
                value={selectedMetric}
                onChange={(e) => setMetric(e.target.value as Metric)}
              >
                {available.map((m) => (
                  <option key={m} value={m}>
                    {METRICS[m].label}
                  </option>
                ))}
              </select>
            </label>
            {data && (
              <TrainingChart
                title={METRICS[selectedMetric].label}
                unit={METRICS[selectedMetric].unit}
                points={data.performances
                  .filter((p) => p[selectedMetric] !== null)
                  .map((p) => ({
                    date: p.workout_date,
                    value: Number(p[selectedMetric]),
                  }))}
              />
            )}
            <p className={styles.muted}>
              {selectedMetric === "estimated_1rm"
                ? "Epley estimate, using loaded sets of 1–12 reps. This is an estimate, not a tested maximum."
                : selectedMetric === "volume"
                  ? "Sum of external weight × reps. Body weight is not included."
                  : "Only recorded, complete sets contribute to progress."}
            </p>
            {fixedExercise && data && (
              <div className={styles.scroll}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Sets</th>
                      {available.map((m) => (
                        <th key={m}>{METRICS[m].label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.performances].reverse().map((p) => (
                      <tr key={p.workout_id}>
                        <td>
                          <Link href={`/train/workouts/${p.workout_id}`}>
                            {p.workout_date}
                          </Link>
                        </td>
                        <td>{p.sets}</td>
                        {available.map((m) => (
                          <td key={m}>
                            {p[m] === null
                              ? "—"
                              : Number(p[m]).toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <p className={styles.empty}>
            Choose an exercise to see its progress over time.
          </p>
        )}
      </section>
      {!fixedExercise && data && (
        <>
          <div className={styles.columns}>
            <section className={styles.card}>
              <h2>Workouts per week</h2>
              <TrainingChart
                title="Weekly workouts"
                unit="sessions"
                points={counts("week")}
              />
            </section>
            <section className={styles.card}>
              <h2>Workouts per month</h2>
              <TrainingChart
                title="Monthly workouts"
                unit="sessions"
                points={counts("month")}
              />
            </section>
          </div>
          <section className={styles.card}>
            <div className={styles.sectionHeading}>
              <h2>Training days</h2>
              <label>
                Month
                <CalendarInput aria-label="Calendar month"
                  type="month"
                  value={calendarMonth}
                  onChange={(e) => {
                    if (e.target.value) setCalendarMonth(e.target.value);
                  }}
                />
              </label>
            </div>
            {calendar.error && <p className={styles.error}>{calendar.error}</p>}
            <div className={styles.calendar}>
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={`day${i}`}>{d}</span>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <span key={`empty${i}`} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const date = `${calendarMonth}-${String(i + 1).padStart(2, "0")}`,
                  w = calendar.data?.workouts.find(
                    (w) => w.workout_date === date,
                  );
                return w ? (
                  <Link
                    key={date}
                    href={`/train/workouts/${w.id}`}
                    aria-label={`Workout ${date}`}
                  >
                    {i + 1}
                  </Link>
                ) : (
                  <span key={date}>{i + 1}</span>
                );
              })}
            </div>
            <p className={styles.muted}>
              Highlighted days have a workout. Tap one to open it.
            </p>
          </section>
        </>
      )}
      <div className={styles.actions}>
        {page > 0 && (
          <button onClick={() => setPage((p) => p - 1)}>Previous period</button>
        )}
        {data?.more && (
          <button onClick={() => setPage((p) => p + 1)}>Next period</button>
        )}
      </div>
    </>
  );
}
