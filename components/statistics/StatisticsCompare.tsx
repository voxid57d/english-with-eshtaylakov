"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { downloadSvgAsJpg } from "@/lib/chartExport";
import { trendBounds } from "@/lib/marketingMetrics";
import { changeTone, compareMonths, monthDailySeries, monthRange, shiftMonth, statisticInstant, STATISTIC_DIRECTIONS, STATISTIC_KINDS, STATISTIC_UNITS, type MonthCell, type StatisticCategory, type StatisticReading, type StatisticUnit } from "@/lib/statistics";
import { statisticStamp } from "./StatisticsChart";
import { statisticsRequest } from "./statisticsRequest";
import shared from "@/components/marketing/marketing.module.css";
import styles from "./statistics.module.css";

const RANGES = [3, 6, 12] as const;
const WIDTH = 1100;
const OTHER_MONTH_COLORS = ["#94a3b8", "#f59e0b", "#a78bfa", "#38bdf8", "#f472b6", "#fb923c", "#4ade80", "#e879f9", "#facc15", "#2dd4bf", "#f87171"];
const TONE_COLORS = { good: "#34d399", bad: "#fb7185", neutral: "#94a3b8" };
const full = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
const compactFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const compact = (value: number) => Math.abs(value) >= 100_000 ? compactFormat.format(value) : full(value);
const signed = (value: number, format = compact) => `${value > 0 ? "+" : ""}${format(value)}`;
const monthName = (month: string, year = true) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
const ordinal = (day: number) => `${day}${[11, 12, 13].includes(day % 100) ? "th" : ["th", "st", "nd", "rd"][day % 10] ?? "th"}`;

type Row = StatisticCategory & { cells: MonthCell[] };

export default function StatisticsCompare({ categories, endMonth, today }: { categories: StatisticCategory[]; endMonth: string; today: string }) {
   const [range, setRange] = useState<(typeof RANGES)[number]>(12);
   const [sameDay, setSameDay] = useState(true);
   const [readings, setReadings] = useState<StatisticReading[]>([]);
   const [loaded, setLoaded] = useState("");
   // Errors belong to the range that failed, so changing the range clears them.
   const [failure, setFailure] = useState({ key: "", message: "" });
   const [retry, setRetry] = useState(0);
   const [chosenId, setChosenId] = useState("");
   const [chosenMonths, setChosenMonths] = useState<string[] | null>(null);
   const months = useMemo(() => monthRange(shiftMonth(endMonth, range - 1), endMonth), [endMonth, range]);
   const isCurrent = endMonth === today.slice(0, 7);
   const asOfDay = isCurrent && sameDay ? Number(today.slice(8, 10)) : null;
   // One extra month before the first, so the first column has a change too.
   const loadKey = `${shiftMonth(months[0], 1)}|${endMonth}`;

   useEffect(() => {
      const controller = new AbortController();
      const [from, to] = loadKey.split("|");
      statisticsRequest(`?from=${from}&to=${to}`, undefined, controller.signal)
         .then((result: { readings: StatisticReading[] }) => { if (!controller.signal.aborted) { setReadings(result.readings); setLoaded(loadKey); } })
         .catch((cause) => { if (!controller.signal.aborted) setFailure({ key: loadKey, message: cause instanceof Error ? cause.message : "Could not load the months." }); });
      return () => controller.abort();
   }, [loadKey, retry]);

   const rows: Row[] = useMemo(() => categories.map((category) => ({ ...category, cells: compareMonths(readings, category, months, asOfDay) })), [categories, readings, months, asOfDay]);
   const groups = Object.keys(STATISTIC_UNITS).map((unit) => [unit as StatisticUnit, rows.filter((row) => row.unit === unit)] as const).filter(([, items]) => items.length);
   const chosen = categories.find((category) => category.id === chosenId) ?? categories[0];
   const chartMonths = (chosenMonths ?? months.slice(-3)).filter((month) => months.includes(month));

   function exportCsv() {
      const header = ["Category", "Unit", "Figure type", "Direction", ...months.flatMap((month) => [monthName(month), `${monthName(month)} change`])];
      const lines = rows.map((row) => [row.name, STATISTIC_UNITS[row.unit], STATISTIC_KINDS[row.kind], STATISTIC_DIRECTIONS[row.direction], ...row.cells.flatMap((cell) => [cell.value ?? "", cell.change ?? ""])]);
      const csv = [header, ...lines].map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `statistics-${months[0]}-to-${endMonth}${asOfDay ? `-day-${asOfDay}` : ""}.csv`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
   }

   if (failure.key === loadKey) return <div className={shared.error} role="alert">{failure.message}<button onClick={() => { setFailure({ key: "", message: "" }); setRetry((value) => value + 1); }}>Retry</button></div>;
   if (loaded !== loadKey) return <p className={shared.loading}>Loading {range} months…</p>;

   return <div className={shared.charts}>
      <div className={shared.chartFilters}>
         <div><h2>Compare months</h2><p>{asOfDay ? `Every month as of its ${ordinal(asOfDay)}, so the unfinished month is compared fairly.` : "Each month’s last figure."} Green and red follow each category’s direction.</p></div>
         <div className={shared.filters}>
            <label className={shared.field}>Months<select value={range} onChange={(event) => setRange(Number(event.target.value) as (typeof RANGES)[number])}>{RANGES.map((value) => <option key={value} value={value}>Last {value} months</option>)}</select></label>
            {isCurrent && <label className={shared.field}>Compare at<select value={sameDay ? "day" : "end"} onChange={(event) => setSameDay(event.target.value === "day")}>
               <option value="day">Same day ({ordinal(Number(today.slice(8, 10)))} of each month)</option><option value="end">End of each month</option>
            </select></label>}
            <button className={shared.secondary} onClick={exportCsv}>↓ Export CSV</button>
         </div>
      </div>

      <section className={`${shared.sheetCard} ${styles.scorecard}`} aria-label="Monthly scorecard">
         <div className={shared.tableScroll} tabIndex={0} aria-label="Monthly scorecard; scroll horizontally for more months">
            <table className={styles.scoreTable}>
               <caption className={shared.srOnly}>Figures for each category by month</caption>
               <thead><tr><th scope="col">Category</th>{months.map((month) => <th scope="col" key={month} className={month === endMonth && isCurrent ? styles.currentMonth : ""}>{monthName(month, month.slice(5) === "01" || month === months[0])}{month === endMonth && asOfDay ? <small>as of {ordinal(asOfDay)}</small> : month === endMonth && isCurrent ? <small>so far</small> : null}</th>)}<th scope="col">Trend</th></tr></thead>
               {groups.map(([unit, items]) => <tbody key={unit}>
                  <tr className={styles.unitRow}><th colSpan={months.length + 2} scope="rowgroup">{STATISTIC_UNITS[unit]}</th></tr>
                  {items.map((row) => <tr key={row.id} className={row.id === chosen?.id ? styles.chosenRow : ""}>
                     <th scope="row"><button type="button" onClick={() => setChosenId(row.id)} title="Show this category in the charts below"><i style={{ background: row.color }} />{row.name}</button><small>{row.kind === "monthly" ? "Monthly counter" : "Running total"}</small></th>
                     {row.cells.map((cell) => {
                        const tone = changeTone(row.direction, cell.change);
                        return <td key={cell.month} className={cell.month === endMonth && isCurrent ? styles.currentMonth : ""}
                           title={cell.value === null ? "No figure" : `${row.name} · ${monthName(cell.month)}: ${full(cell.value)}${cell.change !== null ? ` (${signed(cell.change, full)} vs previous month)` : ""}${cell.recorded_at ? ` · from ${statisticStamp(cell.recorded_at)}` : ""}${cell.carried ? " · no entry this month yet, carried forward" : ""}`}>
                           {cell.value === null ? <span className={styles.noFigure}>—</span> : <><strong>{compact(cell.value)}{cell.carried && <sup>*</sup>}</strong>
                              {cell.change !== null && <em className={styles[tone]}>{signed(cell.change)}</em>}</>}
                        </td>;
                     })}
                     <td className={styles.sparkCell}><Sparkline cells={row.cells} color={row.color} /></td>
                  </tr>)}
               </tbody>)}
            </table>
         </div>
         <footer className={shared.sheetFooter}><span>Each cell: the month’s figure and its change from the month before. * no entry that month yet; a running total carries its last figure forward.</span><span>Click a category to chart it below.</span></footer>
      </section>

      {chosen && <>
         <div className={shared.chartFilters}>
            <div><h2>{chosen.name}</h2><p>{STATISTIC_KINDS[chosen.kind]} · {STATISTIC_DIRECTIONS[chosen.direction]} · {STATISTIC_UNITS[chosen.unit]}</p></div>
            <div className={shared.filters}>
               <label className={shared.field}>Category<select value={chosen.id} onChange={(event) => setChosenId(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            </div>
         </div>
         <fieldset className={styles.categoryPicker}>
            <legend>Months in the day-by-day chart</legend>
            {[...months].reverse().map((month) => <label key={month}><input type="checkbox" checked={chartMonths.includes(month)} onChange={(event) => setChosenMonths(event.target.checked ? [...chartMonths, month].sort() : chartMonths.filter((item) => item !== month))} />{monthName(month)}</label>)}
         </fieldset>
         <MonthLinesChart category={chosen} readings={readings} months={chartMonths} endMonth={endMonth} today={today} isCurrent={isCurrent} />
         <MonthBarsChart category={chosen} cells={rows.find((row) => row.id === chosen.id)?.cells ?? []} endMonth={endMonth} isCurrent={isCurrent} asOfDay={asOfDay} />
      </>}
   </div>;
}

function Sparkline({ cells, color }: { cells: MonthCell[]; color: string }) {
   const values = cells.flatMap((cell) => cell.value === null ? [] : [cell.value]);
   if (values.length < 2) return null;
   const min = Math.min(...values), max = Math.max(...values);
   const x = (index: number) => 4 + index / Math.max(cells.length - 1, 1) * 92;
   const y = (value: number) => max === min ? 14 : 24 - (value - min) / (max - min) * 20;
   const points = cells.flatMap((cell, index) => cell.value === null ? [] : [`${x(index)},${y(cell.value)}`]);
   const last = cells.findLast((cell) => cell.value !== null)!;
   return <svg width="100" height="28" viewBox="0 0 100 28" aria-hidden="true">
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx={x(cells.indexOf(last))} cy={y(last.value!)} r="2.5" fill={color} />
   </svg>;
}

function ChartFrame({ toolbar, title, subtitle, footer, height, filename, children }: { toolbar: string; title: string; subtitle: string; footer: string; height: number; filename: string; children: ReactNode }) {
   const svg = useRef<SVGSVGElement>(null);
   const [exporting, setExporting] = useState(false);
   const [error, setError] = useState("");
   async function exportJpg() {
      if (!svg.current) return;
      setExporting(true); setError("");
      try { await downloadSvgAsJpg(svg.current, WIDTH, height, filename); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "JPG export failed. Please retry."); }
      finally { setExporting(false); }
   }
   return <article className={shared.chartCard}>
      <div className={shared.chartToolbar}><span>{toolbar}</span><button disabled={exporting} onClick={() => void exportJpg()}>{exporting ? "Exporting…" : "↓ Export JPG"}</button></div>
      <div className={shared.chartScroll}><svg ref={svg} xmlns="http://www.w3.org/2000/svg" width={WIDTH} height={height} viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={`${title}, ${subtitle}`} style={{ width: "100%", height: "auto", minWidth: 600, display: "block", fontFamily: "Arial, Helvetica, sans-serif" }}>
         <title>{`${title} — ${subtitle}`}</title>
         <rect width={WIDTH} height={height} rx="18" fill="#0b1220" />
         <rect x="40" y="38" width="4" height="55" rx="2" fill="#34d399" />
         <text x="60" y="62" fill="#f8fafc" fontSize="26" fontWeight="700">{title}</text>
         <text x="60" y="90" fill="#94a3b8" fontSize="15">{subtitle}</text>
         {children}
         <line x1="40" x2="1060" y1={height - 42} y2={height - 42} stroke="#263247" />
         <text x="40" y={height - 20} fill="#64748b" fontSize="11">STATISTICS / {footer}</text>
      </svg></div>
      {error && <p role="alert" className={shared.error}>{error}</p>}
   </article>;
}

/** Each month as its own line over days 1–31, to compare pace at the same point in the month. */
export function MonthLinesChart({ category, readings, months, endMonth, today, isCurrent }: { category: StatisticCategory; readings: StatisticReading[]; months: string[]; endMonth: string; today: string; isCurrent: boolean }) {
   // Days after today have no figures yet.
   const now = Date.parse(statisticInstant(today, "23:59"));
   const ordered = [...months].sort().reverse();
   const series = ordered.map((month, index) => ({ month, color: index === 0 && month === endMonth ? category.color : OTHER_MONTH_COLORS[index % OTHER_MONTH_COLORS.length], newest: index === 0, points: monthDailySeries(readings, category, month, now) }));
   const values = series.flatMap((line) => line.points.flatMap((point) => point.value === null ? [] : [point.value]));
   const legendHeight = Math.ceil(Math.max(series.length, 1) / 4) * 40;
   const height = 520 + legendHeight;
   const subtitle = `${category.name} · ${STATISTIC_UNITS[category.unit]} · ${months.length} months, day by day`;
   if (!values.length) return <article className={shared.chartCard}><div className={shared.chartEmpty}><h3>Month against month</h3><p>{months.length ? `No figures for ${category.name} in the chosen months.` : "Choose at least one month."}</p></div></article>;
   const { min, max } = trendBounds(values);
   const left = 190, right = 1030, top = 165, bottom = 425;
   const x = (day: number) => left + (day - 1) / 30 * (right - left);
   const y = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
   const todayDay = Number(today.slice(8, 10));
   return <ChartFrame toolbar="MONTH AGAINST MONTH" title="Month against month" subtitle={subtitle} height={height} filename={`statistics-${category.name.replace(/[^a-z0-9]+/gi, "-")}-months.jpg`}
      footer={category.kind === "monthly" ? "Monthly counter: each line starts at the month’s first entry" : "Running total: each day shows the latest figure so far"}>
      {[0, 1, 2, 3, 4].map((tick) => { const value = min + (max - min) * tick / 4; return <g key={tick}>
         <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#263247" strokeDasharray="4 6" />
         <text x={left - 16} y={y(value) + 5} textAnchor="end" fill="#94a3b8" fontSize="13">{value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</text>
      </g>; })}
      <text x={left} y="137" fill="#94a3b8" fontSize="12">{STATISTIC_UNITS[category.unit].toUpperCase()} · DAY OF MONTH →</text>
      {[1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31].map((day) => <text key={day} x={x(day)} y="451" textAnchor="middle" fill="#94a3b8" fontSize="12">{day}</text>)}
      {isCurrent && months.includes(endMonth) && <g>
         <line x1={x(todayDay)} x2={x(todayDay)} y1={top - 10} y2={bottom} stroke="#34d399" strokeOpacity="0.5" strokeDasharray="3 5" />
         <text x={x(todayDay)} y={top - 16} textAnchor="middle" fill="#34d399" fontSize="11">TODAY</text>
      </g>}
      {[...series].reverse().map((line) => {
         let path = "";
         let drawing = false;
         for (const point of line.points) {
            if (point.value === null) { drawing = false; continue; }
            path += `${drawing ? "L" : "M"}${x(point.day)},${y(point.value)} `;
            drawing = true;
         }
         return <g key={line.month}>
            <path d={path} fill="none" stroke={line.color} strokeWidth={line.newest ? 3.5 : 2} strokeOpacity={line.newest ? 1 : 0.85} strokeLinejoin="round" strokeLinecap="round" />
            {line.points.map((point) => point.recorded && point.value !== null && <circle key={point.day} cx={x(point.day)} cy={y(point.value)} r={line.newest ? 3.5 : 2.5} fill={line.color}><title>{`${monthName(line.month)} · day ${point.day}: ${full(point.value)}`}</title></circle>)}
         </g>;
      })}
      {series.map((line, index) => {
         const lastValue = line.points.findLast((point) => point.value !== null)?.value;
         const cx = 64 + index % 4 * 255, cy = 490 + Math.floor(index / 4) * 40;
         return <g key={line.month}>
            <rect x={cx - 8} y={cy - 3} width="16" height="6" rx="3" fill={line.color} />
            <text x={cx + 16} y={cy + 5} fill="#cbd5e1" fontSize="13">{monthName(line.month)}{lastValue !== undefined && lastValue !== null ? ` · ${compact(lastValue)}` : ""}</text>
         </g>;
      })}
   </ChartFrame>;
}

/** One bar per month: the month's figure, coloured by whether the change from the month before was good or bad. */
export function MonthBarsChart({ category, cells, endMonth, isCurrent, asOfDay }: { category: StatisticCategory; cells: MonthCell[]; endMonth: string; isCurrent: boolean; asOfDay: number | null }) {
   const values = cells.flatMap((cell) => cell.value === null ? [] : [cell.value]);
   if (!values.length) return <article className={shared.chartCard}><div className={shared.chartEmpty}><h3>Month by month</h3><p>No figures for {category.name} in these months.</p></div></article>;
   const height = 560;
   const min = Math.min(0, ...values), max = Math.max(1, ...values);
   const top = 150, bottom = 430, left = 80, right = 1040;
   const slot = (right - left) / cells.length;
   const y = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
   const barWidth = Math.min(56, slot * 0.6);
   return <ChartFrame toolbar="MONTH BY MONTH" title="Month by month" subtitle={`${category.name} · ${STATISTIC_UNITS[category.unit]}${asOfDay ? ` · each month as of its ${ordinal(asOfDay)}` : ""}`} height={height}
      filename={`statistics-${category.name.replace(/[^a-z0-9]+/gi, "-")}-by-month.jpg`} footer={`Bar colour: change from the month before (${STATISTIC_DIRECTIONS[category.direction].toLowerCase()})`}>
      <line x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="#334155" />
      {cells.map((cell, index) => {
         const cx = left + slot * index + slot / 2;
         const tone = changeTone(category.direction, cell.change);
         const current = cell.month === endMonth && isCurrent;
         return <g key={cell.month}>
            {cell.value !== null && <rect x={cx - barWidth / 2} y={Math.min(y(0), y(cell.value))} width={barWidth} height={Math.max(2, Math.abs(y(cell.value) - y(0)))} rx="5"
               fill={tone === "neutral" ? category.color : TONE_COLORS[tone]} fillOpacity={current ? 0.55 : 0.9} stroke={current ? "#f8fafc" : "none"} strokeDasharray={current ? "4 4" : undefined}>
               <title>{`${monthName(cell.month)}: ${full(cell.value)}${cell.change !== null ? ` (${signed(cell.change, full)})` : ""}`}</title></rect>}
            <text x={cx} y={cell.value === null ? bottom - 8 : Math.min(y(0), y(cell.value)) - 8} textAnchor="middle" fill={cell.value === null ? "#64748b" : "#f8fafc"} fontSize="13" fontWeight="600">{cell.value === null ? "—" : compact(cell.value)}</text>
            <text x={cx} y={bottom + 24} textAnchor="middle" fill="#cbd5e1" fontSize="12">{monthName(cell.month, false)}</text>
            <text x={cx} y={bottom + 40} textAnchor="middle" fill="#64748b" fontSize="11">{cell.month.slice(0, 4)}</text>
            {cell.change !== null && <text x={cx} y={bottom + 58} textAnchor="middle" fill={TONE_COLORS[tone]} fontSize="12">{signed(cell.change)}</text>}
         </g>;
      })}
   </ChartFrame>;
}
