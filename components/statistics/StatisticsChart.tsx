"use client";

import { useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { downloadSvgAsJpg } from "@/lib/chartExport";
import { monthDays, previousDate, trendBounds } from "@/lib/marketingMetrics";
import { categoryPoints, dayChange, dayPoints, monthChange, statisticDate, statisticInstant, statisticTime, type StatisticCategory, type StatisticPoint, type StatisticReading } from "@/lib/statistics";
import shared from "@/components/marketing/marketing.module.css";

export type StatisticsChartKind = "latest" | "trend" | "day" | "month";
export type StatisticsChartText = { title: string; subtitle: string; toolbar: string; axisLabel: string; footer: string; filename: string; emptyMessage: string; periodLabel: string };

const WIDTH = 1100;
const DAY_MS = 86400_000;
// Readings further apart than this are joined with a dashed line: at least one day was skipped.
const GAP_MS = 36 * 3600_000;
const PLOT = { right: 1030, top: 165, bottom: 425 };
const format = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
const signed = (value: number) => `${value > 0 ? "+" : ""}${format(value)}`;
const wrap = (text: string, length: number) => text.match(new RegExp(`.{1,${length}}`, "g")) || [text];
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
export const statisticStamp = (instant: string) => `${weekday(statisticDate(instant))} ${statisticDate(instant).slice(5)} ${statisticTime(instant)}`;

type Line = StatisticCategory & { points: StatisticPoint[]; before: StatisticPoint | null };

export default function StatisticsChart({ kind, categories, readings, month, date, text }: {
   kind: StatisticsChartKind; categories: StatisticCategory[]; readings: StatisticReading[];
   month: string; date: string; text: StatisticsChartText;
}) {
   const svg = useRef<SVGSVGElement>(null);
   const tooltipId = useId();
   const [exporting, setExporting] = useState(false);
   const [error, setError] = useState("");
   const [active, setActive] = useState<number | null>(null);
   const isLine = kind === "trend" || kind === "day";
   const days = monthDays(month);
   const [x0, x1] = kind === "day"
      ? [Date.parse(statisticInstant(date, "00:00")), Date.parse(statisticInstant(date, "00:00")) + DAY_MS]
      : [Date.parse(statisticInstant(days[0], "00:00")), Date.parse(statisticInstant(previousDate(days[days.length - 1], -1), "00:00"))];

   const lines: Line[] = useMemo(() => !isLine ? [] : categories.map((category) => kind === "day"
      ? { ...category, ...dayPoints(readings, category, date) }
      : { ...category, before: null, points: categoryPoints(readings, category.id).filter((point) => point.at >= x0 && point.at < x1) }), [isLine, kind, categories, readings, date, x0, x1]);
   const rows = useMemo(() => isLine ? [] : categories.map((category) => {
      if (kind === "latest") {
         const latest = dayChange(readings, category, date);
         return { ...category, value: latest?.change ?? null, detail: latest
            ? `${format(latest.value)} at ${statisticTime(latest.recorded_at)}${latest.since ? ` · vs ${statisticStamp(latest.since)}` : latest.restarted ? " · first figure this month (counter restarts at 0)" : " · no figure in the 7 days before"}${latest.stepChange !== null && latest.stepSince && latest.stepSince !== latest.since ? ` · ${signed(latest.stepChange)} since ${statisticStamp(latest.stepSince)}` : ""}`
            : "" };
      }
      const change = monthChange(readings, category, month);
      return { ...category, value: change?.change ?? null, detail: !change ? "" : change.start === null
         ? `Monthly counter · month total as of ${statisticStamp(change.end)}`
         : `${statisticStamp(change.start)} → ${statisticStamp(change.end)} · ${change.percent === null ? "% unavailable (non-positive start)" : `${change.percent > 0 ? "+" : ""}${change.percent.toFixed(2)}%`}` };
   }).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)), [isLine, kind, categories, readings, date, month]);

   const hasData = isLine ? lines.some((line) => line.points.length) : rows.some((row) => row.value !== null);
   const legendHeight = Math.ceil(categories.length / 3) * 68;
   const height = isLine ? 510 + legendHeight : 190 + Math.max(rows.length, 1) * 80;
   const lineValues = lines.flatMap((line) => [...line.points, ...(line.before ? [line.before] : [])].map((point) => point.value));
   const barValues = rows.map((row) => row.value ?? 0);
   const { min, max } = isLine ? trendBounds(lineValues) : { min: Math.min(0, ...barValues), max: Math.max(1, ...barValues) };
   const left = 190;
   const x = (at: number) => left + (Math.min(Math.max(at, x0), x1) - x0) / (x1 - x0) * (PLOT.right - left);
   const y = (value: number) => PLOT.bottom - (value - min) / (max - min) * (PLOT.bottom - PLOT.top);
   const bx = (value: number) => 285 + (value - min) / (max - min) * 610;
   const xTicks = kind === "day"
      ? Array.from({ length: 9 }, (_, index) => ({ at: x0 + index * 3 * 3600_000, label: `${String(index * 3).padStart(2, "0")}:00` }))
      : days.filter((_, index) => index % Math.ceil(days.length / 10) === 0).map((day) => ({ at: Date.parse(statisticInstant(day, "00:00")), label: day.slice(-2) }));
   // Hover snaps to recorded check-ins.
   const targets = useMemo(() => [...new Set(lines.flatMap((line) => line.points.map((point) => point.at)))].sort((a, b) => a - b), [lines]);
   const activeAt = active !== null ? targets[active] ?? null : null;

   async function exportJpg() {
      if (!svg.current) return;
      setExporting(true); setError("");
      try { await downloadSvgAsJpg(svg.current, WIDTH, height, text.filename); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "JPG export failed. Please retry."); }
      finally { setExporting(false); }
   }

   function inspect(event: PointerEvent<HTMLDivElement>) {
      const plot = event.currentTarget.querySelector("svg");
      if (!plot || !targets.length) return;
      const bounds = plot.getBoundingClientRect();
      const px = (event.clientX - bounds.left) / bounds.width * WIDTH;
      const py = (event.clientY - bounds.top) / bounds.height * height;
      if (px < left || px > PLOT.right || py < PLOT.top || py > PLOT.bottom) return;
      let best = 0;
      targets.forEach((at, index) => { if (Math.abs(x(at) - px) < Math.abs(x(targets[best]) - px)) best = index; });
      setActive(best);
   }

   const plot = <svg ref={svg} xmlns="http://www.w3.org/2000/svg" width={WIDTH} height={height} viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={`${text.title}, ${text.subtitle}`} style={{ width: "100%", height: "auto", minWidth: 600, display: "block", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <title>{`${text.title} — ${text.subtitle}`}</title>
      <rect width={WIDTH} height={height} rx="18" fill="#0b1220" />
      <rect x="40" y="38" width="4" height="55" rx="2" fill="#34d399" />
      <text x="60" y="62" fill="#f8fafc" fontSize="26" fontWeight="700">{text.title}</text>
      <text x="60" y="90" fill="#94a3b8" fontSize="15">{text.subtitle}</text>
      {isLine ? <>
         {[0, 1, 2, 3, 4].map((tick) => { const value = min + (max - min) * tick / 4; return <g key={tick}>
            <line x1={left} x2={PLOT.right} y1={y(value)} y2={y(value)} stroke="#263247" strokeDasharray="4 6" />
            <text x={left - 16} y={y(value) + 5} textAnchor="end" fill="#94a3b8" fontSize="13">{value.toLocaleString("en-US", { maximumFractionDigits: 4 })}</text>
         </g>; })}
         <text x={left} y="137" fill="#94a3b8" fontSize="12">{text.axisLabel}</text>
         {xTicks.map((tick) => <text key={tick.at} x={x(tick.at)} y="451" textAnchor="middle" fill="#94a3b8" fontSize="12">{tick.label}</text>)}
         {lines.map((line, index) => {
            const solid: string[] = [];
            const dashed: string[] = [];
            line.points.forEach((point, pointIndex) => {
               const previous = pointIndex ? line.points[pointIndex - 1] : null;
               if (!previous) return;
               (point.at - previous.at > GAP_MS ? dashed : solid).push(`M${x(previous.at)},${y(previous.value)} L${x(point.at)},${y(point.value)}`);
            });
            const first = line.points[0];
            return <g key={line.id}>
               {line.before && first && <>
                  <path d={`M${x(x0)},${y(line.before.value)} L${x(first.at)},${y(first.value)}`} fill="none" stroke={line.color} strokeOpacity="0.45" strokeWidth="2" strokeDasharray="5 6" />
                  <circle cx={x(x0)} cy={y(line.before.value)} r="4" fill="#0b1220" stroke={line.color} strokeOpacity="0.6" strokeWidth="2"><title>{`${line.name} · before this day, ${statisticStamp(line.before.recorded_at)}: ${format(line.before.value)}`}</title></circle>
               </>}
               {dashed.length > 0 && <path d={dashed.join(" ")} fill="none" stroke={line.color} strokeOpacity="0.55" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" />}
               {solid.length > 0 && <path d={solid.join(" ")} fill="none" stroke={line.color} strokeWidth="3" strokeLinecap="round" />}
               {line.points.map((point) => <circle key={point.reading_id} cx={x(point.at)} cy={y(point.value)} r="4" fill={line.color} stroke="#0b1220" strokeWidth="1.5"><title>{`${line.name} · ${statisticStamp(point.recorded_at)}: ${format(point.value)}`}</title></circle>)}
               <circle cx={64 + index % 3 * 345} cy={490 + Math.floor(index / 3) * 68} r="5" fill={line.color} />
               <text x={78 + index % 3 * 345} y={495 + Math.floor(index / 3) * 68} fill="#cbd5e1" fontSize="13">{wrap(line.name, 34).map((part, partIndex) => <tspan key={partIndex} x={78 + index % 3 * 345} dy={partIndex ? 16 : 0}>{part}</tspan>)}</text>
            </g>;
         })}
         <g data-chart-interaction="true">
            {activeAt !== null && <line x1={x(activeAt)} x2={x(activeAt)} y1={PLOT.top} y2={PLOT.bottom} stroke="#94a3b8" strokeDasharray="4 4" pointerEvents="none" />}
            <rect x={left} y={PLOT.top} width={PLOT.right - left} height={PLOT.bottom - PLOT.top} fill="transparent" style={{ cursor: "crosshair" }} />
         </g>
      </> : <>
         <line x1={bx(0)} x2={bx(0)} y1="123" y2={130 + rows.length * 80} stroke="#334155" />
         {rows.map((row, index) => <g key={row.id}>
            <text x="52" y={150 + index * 80} fill="#e2e8f0" fontSize="14">{wrap(row.name, 26).map((part, partIndex) => <tspan key={partIndex} x="52" dy={partIndex ? 16 : 0}>{part}</tspan>)}</text>
            <rect x="285" y={134 + index * 80} width="610" height="27" rx="6" fill="#131e30" />
            {row.value !== null && <rect x={Math.min(bx(0), bx(row.value))} y={134 + index * 80} width={Math.max(2, Math.abs(bx(row.value) - bx(0)))} height="27" rx="5" fill={row.color}><title>{`${row.name}: ${signed(row.value)}`}</title></rect>}
            <text x="1048" y={153 + index * 80} textAnchor="end" fill={row.value === null ? "#64748b" : "#f8fafc"} fontSize="17" fontWeight="600">{row.value === null ? "No data" : signed(row.value)}</text>
            {row.detail && <text x="285" y={182 + index * 80} fill="#94a3b8" fontSize="12">{row.detail}</text>}
         </g>)}
      </>}
      <line x1="40" x2="1060" y1={height - 42} y2={height - 42} stroke="#263247" />
      <text x="40" y={height - 20} fill="#64748b" fontSize="11">STATISTICS / {text.footer}</text>
      <text x="1060" y={height - 20} textAnchor="end" fill="#94a3b8" fontSize="11">{text.periodLabel.toUpperCase()}</text>
   </svg>;

   const tooltipRows = activeAt === null ? [] : lines.map((line) => {
      const index = line.points.findIndex((point) => point.at === activeAt);
      const point = index >= 0 ? line.points[index] : null;
      const previous = index > 0 ? line.points[index - 1] : index === 0 ? line.before : null;
      return { ...line, value: point?.value ?? null, change: point && previous ? point.value - previous.value : null };
   }).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));

   return <article className={shared.chartCard}>
      <div className={shared.chartToolbar}><span>{text.toolbar}</span><button disabled={!hasData || exporting} onClick={() => void exportJpg()}>{exporting ? "Exporting…" : "↓ Export JPG"}</button></div>
      {!hasData ? <div className={shared.chartEmpty}><h3>{text.title}</h3><p>{text.emptyMessage}</p></div> : <div className={shared.chartScroll}>
         {!isLine ? plot : <div className={shared.lineInteraction} role="group" tabIndex={0} aria-label={`${text.title}. Hover or use left and right arrow keys to inspect each entry.`} aria-describedby={activeAt !== null ? tooltipId : undefined}
            onPointerMove={inspect} onPointerDown={inspect} onPointerLeave={(event) => { if (event.pointerType !== "touch") setActive(null); }}
            onFocus={() => setActive((current) => current ?? 0)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setActive(null); }}
            onKeyDown={(event) => {
               if (event.key === "Escape") { setActive(null); return; }
               if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !targets.length) return;
               event.preventDefault();
               setActive((current) => event.key === "Home" ? 0 : event.key === "End" ? targets.length - 1 : Math.max(0, Math.min(targets.length - 1, (current ?? 0) + (event.key === "ArrowLeft" ? -1 : 1))));
            }}>
            <div className={shared.lineInteractionLayout}>
               <div className={shared.linePlot}>{plot}</div>
               <div className={shared.lineDetails} onPointerMove={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                  {activeAt !== null ? <div id={tooltipId} role="tooltip" className={shared.lineTooltip}>
                     <strong>{statisticStamp(new Date(activeAt).toISOString())}</strong>
                     <span className={shared.lineTooltipUnit}>{text.axisLabel}</span>
                     <ul>{tooltipRows.map((row) => <li key={row.id}><i style={{ background: row.color }} /><span>{row.name}</span><b>{row.value === null ? "—" : `${format(row.value)}${row.change !== null ? ` (${signed(Number(row.change.toFixed(2)))})` : ""}`}</b></li>)}</ul>
                  </div> : <p className={shared.lineDetailsHint}>Hover over the graph, tap an entry, or use the arrow keys to see its figures here.</p>}
               </div>
            </div>
         </div>}
      </div>}
      {error && <p role="alert" className={shared.error}>{error}</p>}
   </article>;
}
