"use client";

import { useMemo, useState } from "react";
import { audienceShareSeries, comparisonGrowth, competitorGapSeries, momentumSeries } from "@/lib/marketingInsights";
import type { MarketingCentre, MarketingEntry, MarketingPlatform } from "@/lib/marketingMetrics";
import { InsightChart, InsightLines, labelLines, signed } from "./MarketingInsightChart";
import styles from "./marketing.module.css";

export default function MarketingInsights({ centres, platforms, entries, platform, days, monthLabel }: {
   centres: MarketingCentre[]; platforms: MarketingPlatform[]; entries: MarketingEntry[];
   platform: MarketingPlatform; days: string[]; monthLabel: string;
}) {
   const [range, setRange] = useState({ month: "", start: "", end: "" });
   const [focusChoice, setFocusChoice] = useState("");
   const [competitorChoice, setCompetitorChoice] = useState("");
   const month = days[0].slice(0, 7);
   const recordedDays = useMemo(() => {
      const selected = new Set(centres.map((centre) => centre.id));
      const inMonth = new Set(days);
      return [...new Set(entries.filter((entry) => selected.has(entry.centre_id) && entry.platform_id === platform.id && inMonth.has(entry.entry_date)).map((entry) => entry.entry_date))].sort();
   }, [centres, entries, platform.id, days]);
   const start = range.month === month ? range.start : recordedDays[0] || days[0];
   const end = range.month === month ? range.end : recordedDays.at(-1) || days[days.length - 1];
   const focus = centres.find((centre) => centre.id === focusChoice) || centres[0];
   const competitors = centres.filter((centre) => centre.id !== focus?.id);
   const competitor = competitors.find((centre) => centre.id === competitorChoice) || competitors[0];
   const focusId = focus?.id || "";
   const competitorId = competitor?.id || "";
   const growth = useMemo(() => comparisonGrowth(centres, entries, platform.id, start, end).sort((a, b) => (b.percent ?? -Infinity) - (a.percent ?? -Infinity)), [centres, entries, platform.id, start, end]);
   const heatmap = useMemo(() => platforms.map((item) => ({ ...item, rows: comparisonGrowth(centres, entries, item.id, start, end) })), [centres, entries, platforms, start, end]);
   const momentum = useMemo(() => momentumSeries(centres, entries, platform.id, days), [centres, entries, platform.id, days]);
   const shares = useMemo(() => audienceShareSeries(centres, entries, platform.id, days), [centres, entries, platform.id, days]);
   const gap = competitorGapSeries(centres, entries, platform.id, days, focusId, competitorId);
   const values = growth.flatMap((row) => row.percent === null ? [] : [row.percent]);
   const min = Math.min(0, ...values);
   const max = Math.max(0, ...values);
   const bx = (value: number) => 310 + (value - min) / (max - min || 1) * 525;
   const heatScale = Math.max(1, ...heatmap.flatMap((item) => item.rows.flatMap((row) => row.percent === null ? [] : [Math.abs(row.percent)])));
   const heatWidth = Math.max(1100, 310 + platforms.length * 190);
   const columnWidth = (heatWidth - 310) / Math.max(platforms.length, 1);
   const subtitle = `${platform.name} · ${monthLabel}`;
   const filename = (kind: string, period = month) => `marketing-${platform.name.replace(/[^a-z0-9]+/gi, "-")}-${kind}-${period}.jpg`;

   return <>
      <div className={styles.chartFilters}>
         <div><h2>Growth and competitive insights</h2><p>Growth rate and the heatmap compare these exact dates. Trend charts cover {monthLabel}.</p></div>
         <div className={styles.filters}>
            <label className={styles.field}>Comparison start<input type="date" min={days[0]} max={end} value={start} onChange={(event) => { if (days.includes(event.target.value) && event.target.value <= end) setRange({ month, start: event.target.value, end }); }} /></label>
            <label className={styles.field}>Comparison end<input type="date" min={start} max={days[days.length - 1]} value={end} onChange={(event) => { if (days.includes(event.target.value) && event.target.value >= start) setRange({ month, start, end: event.target.value }); }} /></label>
         </div>
      </div>
      <InsightChart title="Growth rate comparison" subtitle={`${platform.name} · ${start} → ${end}`} toolbar="06 / GROWTH RATE" filename={filename("growth-rate", `${start}-to-${end}`)}
         footer="Same dates for every centre. Growth % = net change / starting count × 100. A zero starting count has no growth %."
         hasData={growth.some((row) => row.change !== null)} height={235 + centres.length * 80} emptyMessage={`Choose two different dates with recorded counts at both endpoints (${start} and ${end}).`}>
         <text x="310" y="134" fill="#94a3b8" fontSize="12">AUDIENCE GROWTH (%)</text>
         <line x1={bx(0)} x2={bx(0)} y1="150" y2={150 + centres.length * 80} stroke="#64748b" />
         {growth.map((row, index) => <g key={row.id}>
            <text x="52" y={178 + index * 80} fill="#e2e8f0" fontSize="14"><title>{row.name}</title>{labelLines(row.name, 27).map((line, lineIndex) => <tspan key={lineIndex} x="52" dy={lineIndex ? 16 : 0}>{line}</tspan>)}</text>
            <rect x="310" y={159 + index * 80} width="525" height="27" rx="6" fill="#131e30" />
            {row.percent !== null && row.percent !== 0 && <rect x={Math.min(bx(0), bx(row.percent))} y={159 + index * 80} width={Math.abs(bx(row.percent) - bx(0))} height="27" rx="5" fill={row.color}><title>{`${row.name}: ${signed(row.percent)}%`}</title></rect>}
            {row.percent === 0 && <line x1={bx(0)} x2={bx(0)} y1={159 + index * 80} y2={186 + index * 80} stroke={row.color} strokeWidth="3" />}
            <text x="1048" y={178 + index * 80} textAnchor="end" fill={row.percent === null ? "#94a3b8" : "#f8fafc"} fontSize="17" fontWeight="600">{row.percent === null ? row.change === null ? "No data" : "N/A (starts at 0)" : `${signed(row.percent)}%`}</text>
            <text x="310" y={208 + index * 80} fill="#94a3b8" fontSize="12">{row.change === null ? "Both dates required" : `${signed(row.change)} net subscribers`}</text>
         </g>)}
      </InsightChart>
      <InsightLines title="Growth momentum" subtitle={subtitle} toolbar="07 / SEVEN-DAY MOMENTUM" filename={filename("momentum")} series={momentum} days={days} axisLabel="NET SUBSCRIBERS OVER THE PREVIOUS 7 DAYS"
         footer="Each point = count on that date minus count exactly 7 days earlier. Both endpoints required; gaps mean missing counts."
         emptyMessage="Record counts on two dates exactly seven days apart to see growth momentum." />
      <InsightChart title="Centre × platform growth" subtitle={`All platforms · ${start} → ${end}`} toolbar="08 / PLATFORM HEATMAP" filename={`marketing-platform-heatmap-${start}-to-${end}.jpg`}
         footer="Color intensity shows growth %. Green = gain, pink = loss, slate = zero or unavailable. Net changes use the same dates in every cell."
         width={heatWidth} height={265 + centres.length * 90} hasData={heatmap.some((item) => item.rows.some((row) => row.change !== null))}
         emptyMessage={`Record counts for a centre and platform on both ${start} and ${end} to compare platform growth.`}>
         {heatmap.map((item, index) => <text key={item.id} x={270 + index * columnWidth + columnWidth / 2} y="142" fill="#cbd5e1" fontSize="14" textAnchor="middle"><title>{item.name}</title>{labelLines(item.name, Math.floor(columnWidth / 8)).map((line, lineIndex) => <tspan key={lineIndex} x={270 + index * columnWidth + columnWidth / 2} dy={lineIndex ? 17 : 0}>{line}</tspan>)}</text>)}
         {centres.map((centre, rowIndex) => <g key={centre.id}>
            <circle cx="52" cy={212 + rowIndex * 90} r="4" fill={centre.color} />
            <text x="66" y={216 + rowIndex * 90} fill="#e2e8f0" fontSize="14"><title>{centre.name}</title>{labelLines(centre.name, 23).map((line, index) => <tspan key={index} x="66" dy={index ? 17 : 0}>{line}</tspan>)}</text>
            {heatmap.map((item, columnIndex) => {
               const row = item.rows[rowIndex];
               const cellX = 270 + columnIndex * columnWidth;
               const cellY = 185 + rowIndex * 90;
               const color = row.percent !== null && row.percent !== 0 ? row.percent > 0 ? "#34d399" : "#fb7185" : "#334155";
               const opacity = row.percent === null || row.percent === 0 ? 0.35 : 0.16 + Math.abs(row.percent) / heatScale * 0.5;
               return <g key={item.id}>
                  <title>{`${centre.name} · ${item.name}: ${row.change === null ? "No data on one or both dates" : `${row.percent === null ? "Growth % unavailable (starts at zero)" : `${signed(row.percent)}%`}; ${signed(row.change)} net subscribers`}`}</title>
                  <rect x={cellX} y={cellY} width={columnWidth - 12} height="74" rx="9" fill={color} fillOpacity={opacity} stroke={color} strokeOpacity="0.4" />
                  <text x={cellX + (columnWidth - 12) / 2} y={cellY + 30} textAnchor="middle" fill="#f8fafc" fontSize="18" fontWeight="600">{row.percent === null ? row.change === null ? "No data" : "N/A" : `${signed(row.percent)}%`}</text>
                  <text x={cellX + (columnWidth - 12) / 2} y={cellY + 53} textAnchor="middle" fill="#cbd5e1" fontSize="12">{row.change === null ? "Both dates required" : `${signed(row.change)} net${row.percent === null ? " · starts at 0" : ""}`}</text>
               </g>;
            })}
         </g>)}
      </InsightChart>
      <InsightLines title="Share of tracked audience" subtitle={subtitle} toolbar="09 / AUDIENCE SHARE" filename={filename("audience-share")} series={shares} days={days} axisLabel="SHARE OF SELECTED CENTRES’ SUBSCRIBER COUNTS (%)" percent
         footer="Selected centres only, on this platform; not market share or unique people. A day requires every selected count and a positive total."
         emptyMessage="Audience share needs counts for every selected centre on the same date, with a combined total above zero." />
      <div className={styles.chartFilters}>
         <div><h2>Are you catching up?</h2><p>Positive means the focus centre is ahead; negative means it is behind.</p></div>
         <div className={styles.filters}>
            <label className={styles.field}>Focus centre<select value={focus?.id || ""} onChange={(event) => setFocusChoice(event.target.value)}>{centres.map((centre) => <option key={centre.id} value={centre.id}>{centre.name}</option>)}</select></label>
            <label className={styles.field}>Compare with<select value={competitor?.id || ""} disabled={!competitors.length} onChange={(event) => setCompetitorChoice(event.target.value)}>{!competitors.length && <option value="">Select another centre above</option>}{competitors.map((centre) => <option key={centre.id} value={centre.id}>{centre.name}</option>)}</select></label>
         </div>
      </div>
      <InsightLines title="Gap to competitor" subtitle={subtitle} toolbar="10 / COMPETITOR GAP" filename={filename(`gap-${focus?.id || "none"}-${competitor?.id || "none"}`)} series={gap} days={days} axisLabel="FOCUS CENTRE MINUS COMPARISON CENTRE (SUBSCRIBERS)"
         footer="Above zero = focus centre ahead; below zero = behind. Only dates with counts for both centres are plotted."
         emptyMessage={competitor ? "Record both selected centres on the same date to see the audience gap." : "Select at least two learning centres above to compare their audiences."} />
   </>;
}
