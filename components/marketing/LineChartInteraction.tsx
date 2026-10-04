"use client";

import { cloneElement, useId, useState, type ReactElement, type SVGProps, type PointerEvent } from "react";
import styles from "./marketing.module.css";

type Series = { id: string; name: string; color: string; points: { date: string; value: number | null }[] }[];

export default function LineChartInteraction({ children, series, days, left, right = 1030, top = 165, bottom = 425, width = 1100, height, label, unit, percent = false, signed = false }: {
   children: ReactElement<SVGProps<SVGSVGElement>>; series: Series; days: string[];
   left: number; right?: number; top?: number; bottom?: number; width?: number; height: number; label: string; unit: string; percent?: boolean; signed?: boolean;
}) {
   const id = useId();
   const [activeDate, setActiveDate] = useState<string | null>(null);
   const index = activeDate === null ? -1 : days.indexOf(activeDate);
   const active = index >= 0;
   const position = left + Math.max(index, 0) / Math.max(days.length - 1, 1) * (right - left);
   const recordedDates = new Set(series.flatMap((centre) => centre.points.filter((point) => point.value !== null).map((point) => point.date)));
   const firstRecorded = days.find((date) => recordedDates.has(date)) || days[0];

   function inspect(event: PointerEvent<HTMLDivElement>) {
      const svg = event.currentTarget.querySelector("svg");
      if (!svg || !days.length) return;
      const bounds = svg.getBoundingClientRect();
      const px = (event.clientX - bounds.left) / bounds.width * width;
      const py = (event.clientY - bounds.top) / bounds.height * height;
      if (px < left || px > right || py < top || py > bottom) {
         if (event.pointerType !== "touch") setActiveDate(null);
         return;
      }
      const next = Math.max(0, Math.min(days.length - 1, Math.round((px - left) / (right - left) * (days.length - 1))));
      setActiveDate(days[next]);
   }

   return <div className={styles.lineInteraction} role="group" aria-label={`${label}. Hover or use left and right arrow keys to inspect each date.`} tabIndex={0} aria-describedby={active ? id : undefined}
      onPointerMove={inspect} onPointerDown={inspect} onPointerLeave={(event) => { if (event.pointerType !== "touch") setActiveDate(null); }}
      onFocus={() => setActiveDate(firstRecorded)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setActiveDate(null); }}
      onKeyDown={(event) => {
         if (event.key === "Escape") { setActiveDate(null); return; }
         if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
         event.preventDefault();
         const next = event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : Math.max(0, Math.min(days.length - 1, (index < 0 ? days.indexOf(firstRecorded) : index) + (event.key === "ArrowLeft" ? -1 : 1)));
         setActiveDate(days[next]);
      }}>
      {cloneElement(children, {}, children.props.children,
         <g key="interaction" data-chart-interaction="true">
            {active && <line x1={position} x2={position} y1={top} y2={bottom} stroke="#94a3b8" strokeDasharray="4 4" pointerEvents="none" />}
            <rect x={left} y={top} width={right - left} height={bottom - top} fill="transparent" style={{ cursor: "crosshair" }} />
         </g>)}
      {active && <div id={id} role="tooltip" className={styles.lineTooltip} style={{ left: `${position / width * 100}%`, top: `${top / height * 100}%`, transform: position > (left + right) / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
         onPointerMove={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
         <strong>{new Date(`${activeDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</strong>
         <span className={styles.lineTooltipUnit}>{unit}</span>
         <ul>{series.map((centre) => {
            const value = centre.points.find((point) => point.date === activeDate)?.value ?? null;
            return <li key={centre.id}><i style={{ background: centre.color }} /><span>{centre.name}</span><b>{value === null ? "No data" : `${signed && value > 0 ? "+" : ""}${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${percent ? "%" : ""}`}</b></li>;
         })}</ul>
      </div>}
   </div>;
}
