"use client";
import { useState } from "react";
import styles from "./training.module.css";
export type ChartPoint = { date: string; value: number };
// The existing Marketing/Statistics charts use SVG directly. Keep that approach,
// with a compact date-based renderer and a keyboard-accessible data table.
export default function TrainingChart({
  title,
  unit,
  points,
}: {
  title: string;
  unit: string;
  points: ChartPoint[];
}) {
  const [selected, setSelected] = useState<ChartPoint | null>(null);
  if (!points.length)
    return (
      <div className={styles.empty}>
        No recorded {title.toLowerCase()} in this period.
      </div>
    );
  const values = points.map((p) => p.value),
    min = Math.min(...values),
    max = Math.max(...values),
    pad = Math.max((max - min) * 0.15, max * 0.015, 1),
    low = Math.max(0, min - pad),
    high = max + pad;
  const first = Date.parse(points[0].date),
    last = Date.parse(points[points.length - 1].date);
  const x = (date: string) =>
    58 + ((Date.parse(date) - first) / Math.max(last - first, 86400000)) * 492;
  const y = (value: number) => 195 - ((value - low) / (high - low)) * 158;
  const label = (value: number) =>
    value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const focus = points.find((point) => point.date === selected?.date) ?? points[points.length - 1];
  return (
    <>
      <p className={styles.muted} aria-live="polite">
        {focus.date} ·{" "}
        <b className={styles.accent}>
          {label(focus.value)} {unit}
        </b>
      </p>
      <svg
        className={styles.chart}
        viewBox="0 0 580 230"
        role="img"
        aria-label={`${title}, ${points.length} recorded dates. Values available in the table below.`}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1="58" x2="550" y1={195 - f * 158} y2={195 - f * 158} />
            <text x="48" y={199 - f * 158} textAnchor="end">
              {label(low + f * (high - low))}
            </text>
          </g>
        ))}
        <polyline
          points={points.map((p) => `${x(p.date)},${y(p.value)}`).join(" ")}
        />
        {points.map((p) => (
          <g
            key={p.date}
            onMouseEnter={() => setSelected(p)}
            onClick={() => setSelected(p)}
          >
            <circle
              cx={x(p.date)}
              cy={y(p.value)}
              r={points.length > 100 ? 2 : 4}
            />
            <circle
              cx={x(p.date)}
              cy={y(p.value)}
              r="12"
              style={{ fill: "transparent" }}
            >
              <title>
                {p.date}: {label(p.value)} {unit}
              </title>
            </circle>
          </g>
        ))}
        <text x="58" y="222">
          {points[0].date}
        </text>
        <text x="550" y="222" textAnchor="end">
          {points[points.length - 1].date}
        </text>
      </svg>
      <details className={styles.notes}>
        <summary>View recorded values</summary>
        <div className={styles.scroll}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Date</th>
                <th>
                  {title} ({unit})
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td>{label(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
