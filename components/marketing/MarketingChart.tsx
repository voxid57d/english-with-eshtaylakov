"use client";

import { useMemo, useRef, useState } from "react";
import { dailyAudienceTotals, growthBetween, platformSeries, type MarketingCentre, type MarketingEntry, type MarketingPlatform } from "@/lib/marketingMetrics";
import styles from "./marketing.module.css";

const format = (value: number) => value.toLocaleString("en-US");
const compactFormatter = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const compact = (value: number) => compactFormatter.format(value);
const emptyPlatforms: MarketingPlatform[] = [];
const wrap = (text: string, length: number) => text.match(new RegExp(`.{1,${length}}`, "g")) || [text];

// Statistics uses the same chart drawing and JPG exporter with its own labels.
export type ChartPresentation = {
   title: string; subtitle: string; toolbar: string; axisLabel: string;
   footer: string; filename: string; emptyMessage: string;
};

export default function MarketingChart({ kind, centres, entries, platformId, platformName, platformLogo, platforms = emptyPlatforms, days, date, monthLabel, presentation }: {
   kind: "total" | "daily" | "trend" | "growth"; centres: MarketingCentre[]; entries: MarketingEntry[];
   platformId: string; platformName: string; days: string[]; date: string; monthLabel: string;
   platformLogo?: string | null; platforms?: MarketingPlatform[];
   presentation?: ChartPresentation;
}) {
   const svg = useRef<SVGSVGElement>(null);
   const [exporting, setExporting] = useState(false);
   const [error, setError] = useState("");
   const series = useMemo(() => platformSeries(centres, entries, platformId, days), [centres, entries, platformId, days]);
   const isDaily = kind === "daily" || kind === "total";
   const totals = useMemo(() => new Map(dailyAudienceTotals(centres, platforms, entries, date).map((centre) => [centre.id, centre])), [centres, platforms, entries, date]);
   const chartPlatform = kind === "total" ? "All platforms" : platformName;
   const title = presentation?.title ?? (kind === "total" ? "Total daily audience" : kind === "daily" ? "Daily audience comparison" : kind === "trend" ? "Audience over time" : "Monthly audience growth");
   const subtitle = presentation?.subtitle ?? `${chartPlatform} · ${isDaily ? date : monthLabel}`;
   const rows = series.map((centre) => {
      const rawGrowth = growthBetween(centre.points);
      const firstValue = centre.points.find((point) => point.value !== null)?.value;
      const growth = rawGrowth && presentation ? { ...rawGrowth, change: Number(rawGrowth.change.toFixed(2)), percent: firstValue !== undefined && firstValue !== null && firstValue > 0 ? rawGrowth.percent : null } : rawGrowth;
      return { ...centre, growth, coverage: totals.get(centre.id), value: kind === "total" ? totals.get(centre.id)?.value ?? null : kind === "growth" ? growth?.change ?? null : centre.points.find((point) => point.date === date)?.value ?? null };
   }).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
   const hasData = kind === "trend" ? series.some((centre) => centre.points.some((point) => point.value !== null)) : rows.some((row) => row.value !== null);
   const width = 1100;
   const legendHeight = Math.ceil(centres.length / 3) * 68;
   const height = kind === "trend" ? 510 + legendHeight : 190 + Math.max(rows.length, 1) * 80;
   const values = kind === "trend" ? series.flatMap((centre) => centre.points.map((point) => point.value ?? 0)) : rows.map((row) => row.value ?? 0);
   const min = Math.min(0, ...values);
   const max = Math.max(1, ...values);
   const x = (index: number) => 100 + index / Math.max(days.length - 1, 1) * 930;
   const y = (value: number) => 425 - (value - min) / (max - min) * 260;
   const bx = (value: number) => 285 + (value - min) / (max - min) * 610;

   async function exportJpg() {
      if (!svg.current) return;
      setExporting(true); setError("");
      let sourceUrl: string | undefined;
      let downloadUrl: string | undefined;
      try {
         const source = new XMLSerializer().serializeToString(svg.current);
         sourceUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
         const picture = new Image();
         picture.src = sourceUrl;
         await picture.decode();
         const canvas = document.createElement("canvas");
         canvas.width = width * 2; canvas.height = height * 2;
         const context = canvas.getContext("2d");
         if (!context) throw new Error("Image export is unavailable in this browser.");
         context.fillStyle = "#0b1220"; context.fillRect(0, 0, canvas.width, canvas.height);
         context.drawImage(picture, 0, 0, canvas.width, canvas.height);
         const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not create the JPG.")), "image/jpeg", 0.96));
         downloadUrl = URL.createObjectURL(blob);
         const anchor = document.createElement("a");
         anchor.href = downloadUrl;
         anchor.download = presentation?.filename ?? `marketing-${chartPlatform.replace(/[^a-z0-9]+/gi, "-")}-${kind}-${isDaily ? date : days[0].slice(0, 7)}.jpg`;
         document.body.appendChild(anchor); anchor.click(); anchor.remove();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "JPG export failed. Please retry."); }
      finally {
         if (sourceUrl) URL.revokeObjectURL(sourceUrl);
         if (downloadUrl) { const url = downloadUrl; window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
         setExporting(false);
      }
   }

   return <article className={styles.chartCard}>
      <div className={styles.chartToolbar}><span>{presentation?.toolbar ?? (kind === "total" ? "01 / TOTAL DAILY AUDIENCE" : kind === "daily" ? "02 / DAILY SNAPSHOT" : kind === "trend" ? "03 / MONTHLY TREND" : "04 / GROWTH LEADERBOARD")}</span><button disabled={!hasData || exporting} onClick={() => void exportJpg()}>{exporting ? "Exporting…" : "↓ Export JPG"}</button></div>
      {!hasData ? <div className={styles.chartEmpty}><h3>{title}</h3><p>{presentation?.emptyMessage ?? (kind === "growth" ? "Record at least two dates for a centre to measure growth." : `Add subscriber counts for ${chartPlatform}${isDaily ? ` on ${date}` : " this month"}.`)}</p></div> :
         <div className={styles.chartScroll}><svg ref={svg} xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}, ${subtitle}`} style={{ width: "100%", height: "auto", minWidth: 600, display: "block", fontFamily: "Arial, Helvetica, sans-serif" }}>
            <title>{`${title} — ${subtitle}`}</title>
            <rect width={width} height={height} rx="18" fill="#0b1220" />
            <rect x="40" y="38" width="4" height="55" rx="2" fill="#34d399" />
            <text x="60" y="62" fill="#f8fafc" fontSize="26" fontWeight="700">{title}</text>
            {kind !== "total" && platformLogo && <image href={platformLogo} x="60" y="73" width="22" height="22" preserveAspectRatio="xMidYMid meet" />}
            <text x={kind !== "total" && platformLogo ? 91 : 60} y="90" fill="#94a3b8" fontSize="15">{subtitle}</text>
            {kind === "trend" ? <>
               {[0, 1, 2, 3, 4].map((tick) => <g key={tick}><line x1="100" x2="1030" y1={y(min + (max - min) * tick / 4)} y2={y(min + (max - min) * tick / 4)} stroke="#263247" strokeDasharray="4 6" /><text x="84" y={y(min + (max - min) * tick / 4) + 5} textAnchor="end" fill="#94a3b8" fontSize="13">{compact(min + (max - min) * tick / 4)}</text></g>)}
               <text x="100" y="137" fill="#94a3b8" fontSize="12">{presentation?.axisLabel ?? "SUBSCRIBERS"}</text>
               {days.map((day, index) => (index % 3 === 0 || index === days.length - 1) && <text key={day} x={x(index)} y="451" textAnchor="middle" fill="#94a3b8" fontSize="12">{day.slice(-2)}</text>)}
               {series.map((centre, centreIndex) => {
                  let previous = false;
                  const path = centre.points.map((point, index) => {
                     if (point.value === null) { previous = false; return ""; }
                     const part = `${previous ? "L" : "M"}${x(index)},${y(point.value)}`;
                     previous = true; return part;
                  }).join(" ");
                  return <g key={centre.id}>
                     <path d={path} fill="none" stroke={centre.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                     {centre.points.map((point, index) => point.value !== null && <circle key={point.date} cx={x(index)} cy={y(point.value)} r="4" fill={centre.color} stroke="#0b1220" strokeWidth="1.5"><title>{`${centre.name} · ${point.date}: ${format(point.value)}`}</title></circle>)}
                     <circle cx={64 + centreIndex % 3 * 345} cy={490 + Math.floor(centreIndex / 3) * 68} r="5" fill={centre.color} />
                     <text x={78 + centreIndex % 3 * 345} y={495 + Math.floor(centreIndex / 3) * 68} fill="#cbd5e1" fontSize="13">{wrap(centre.name, 34).map((line, lineIndex) => <tspan key={lineIndex} x={78 + centreIndex % 3 * 345} dy={lineIndex ? 16 : 0}>{line}</tspan>)}</text>
                  </g>;
               })}
            </> : <>
               <line x1={bx(0)} x2={bx(0)} y1="123" y2={130 + rows.length * 80} stroke="#334155" />
               {rows.map((row, index) => <g key={row.id}>
                  <text x="52" y={150 + index * 80} fill="#e2e8f0" fontSize="14">{wrap(row.name, 26).map((line, lineIndex) => <tspan key={lineIndex} x="52" dy={lineIndex ? 16 : 0}>{line}</tspan>)}</text>
                  <rect x="285" y={134 + index * 80} width="610" height="27" rx="6" fill="#131e30" />
                  {row.value !== null && <rect x={Math.min(bx(0), bx(row.value))} y={134 + index * 80} width={Math.max(2, Math.abs(bx(row.value) - bx(0)))} height="27" rx="5" fill={row.color}><title>{`${row.name}: ${format(row.value)}`}</title></rect>}
                  <text x="1048" y={153 + index * 80} textAnchor="end" fill={row.value === null ? "#64748b" : "#f8fafc"} fontSize="17" fontWeight="600">{row.value === null ? "No data" : `${kind === "growth" && row.value > 0 ? "+" : ""}${format(row.value)}`}</text>
                  {kind === "total" && row.coverage && <text x="285" y={182 + index * 80} fill={row.coverage.recordedPlatforms < row.coverage.totalPlatforms ? "#fbbf24" : "#94a3b8"} fontSize="12">{row.coverage.recordedPlatforms} / {row.coverage.totalPlatforms} platforms recorded{row.value !== null && row.coverage.recordedPlatforms < row.coverage.totalPlatforms ? " · Partial total" : ""}</text>}
                  {kind === "growth" && row.growth && <text x="285" y={182 + index * 80} fill="#94a3b8" fontSize="12">{row.growth.start.slice(5)} → {row.growth.end.slice(5)} · {row.growth.percent === null ? (presentation ? "% unavailable (non-positive baseline)" : "% unavailable (starts at zero)") : `${row.growth.percent > 0 ? "+" : ""}${row.growth.percent.toFixed(2)}%`}</text>}
               </g>)}
            </>}
            <line x1="40" x2="1060" y1={height - 42} y2={height - 42} stroke="#263247" />
            <text x="40" y={height - 20} fill="#64748b" fontSize="11">{presentation ? "STATISTICS" : "MARKETING METRICS"} / {presentation?.footer ?? (kind === "total" ? "Sum across platforms; audiences may overlap. Partial totals use recorded counts only." : kind === "trend" ? "Gaps indicate unrecorded days" : kind === "growth" ? "First to last recorded date per centre; periods may differ" : "Recorded counts on the selected date only")}</text>
            <text x="1060" y={height - 20} textAnchor="end" fill="#94a3b8" fontSize="11">{monthLabel.toUpperCase()}</text>
         </svg></div>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
   </article>;
}
