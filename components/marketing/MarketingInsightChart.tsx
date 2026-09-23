"use client";

import { useRef, useState, type ReactNode } from "react";
import { trendBounds } from "@/lib/marketingMetrics";
import type { AudienceSeries } from "@/lib/marketingInsights";
import styles from "./marketing.module.css";

export const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
export const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;
export const labelLines = (value: string, length = 30) => {
   const lines = value.match(new RegExp(`.{1,${length}}`, "g")) || [value];
   return lines.length > 2 ? [lines[0], `${lines[1].slice(0, -1)}…`] : lines;
};

export function InsightChart({ title, subtitle, toolbar, footer, filename, hasData, emptyMessage, width = 1100, height, children }: {
   title: string; subtitle: string; toolbar: string; footer: string; filename: string;
   hasData: boolean; emptyMessage: string; width?: number; height: number; children: ReactNode;
}) {
   const svg = useRef<SVGSVGElement>(null);
   const [exporting, setExporting] = useState(false);
   const [error, setError] = useState("");

   async function exportJpg() {
      if (!svg.current) return;
      setExporting(true); setError("");
      let sourceUrl: string | undefined;
      let downloadUrl: string | undefined;
      try {
         sourceUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg.current)], { type: "image/svg+xml;charset=utf-8" }));
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
         anchor.href = downloadUrl; anchor.download = filename;
         document.body.appendChild(anchor); anchor.click(); anchor.remove();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "JPG export failed. Please retry."); }
      finally {
         if (sourceUrl) URL.revokeObjectURL(sourceUrl);
         if (downloadUrl) { const url = downloadUrl; window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
         setExporting(false);
      }
   }

   return <article className={styles.chartCard}>
      <div className={styles.chartToolbar}><span>{toolbar}</span><button disabled={!hasData || exporting} onClick={() => void exportJpg()}>{exporting ? "Exporting…" : "↓ Export JPG"}</button></div>
      {!hasData ? <div className={styles.chartEmpty}><h3>{title}</h3><p>{emptyMessage}</p></div> :
         <div className={styles.chartScroll}><svg ref={svg} xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}, ${subtitle}`} style={{ width: "100%", height: "auto", minWidth: width > 1100 ? width : 600, display: "block", fontFamily: "Arial, Helvetica, sans-serif" }}>
            <title>{`${title} — ${subtitle}`}</title><desc>{footer}</desc>
            <rect width={width} height={height} rx="18" fill="#0b1220" />
            <rect x="40" y="38" width="4" height="55" rx="2" fill="#34d399" />
            <text x="60" y="62" fill="#f8fafc" fontSize="26" fontWeight="700">{title}</text>
            <text x="60" y="90" fill="#94a3b8" fontSize="15">{labelLines(subtitle, 100).map((line, index) => <tspan key={index} x="60" dy={index ? 19 : 0}>{line}</tspan>)}</text>
            {children}
            <line x1="40" x2={width - 40} y1={height - 60} y2={height - 60} stroke="#263247" />
            <text x="40" y={height - 38} fill="#94a3b8" fontSize="11">{labelLines(`MARKETING METRICS / ${footer}`, Math.floor((width - 80) / 6.5)).map((line, index) => <tspan key={index} x="40" dy={index ? 17 : 0}>{line}</tspan>)}</text>
         </svg></div>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
   </article>;
}

export function InsightLines({ title, subtitle, toolbar, footer, filename, emptyMessage, series, days, axisLabel, percent = false }: {
   title: string; subtitle: string; toolbar: string; footer: string; filename: string; emptyMessage: string;
   series: AudienceSeries; days: string[]; axisLabel: string; percent?: boolean;
}) {
   const values = series.flatMap((centre) => centre.points.flatMap((point) => point.value === null ? [] : [point.value]));
   const bounds = trendBounds(values);
   // Percentage shares cannot leave 0–100, even for a constant series.
   const min = percent ? Math.max(0, bounds.min) : bounds.min;
   const max = percent ? Math.min(100, bounds.max) : bounds.max;
   const x = (index: number) => 190 + index / Math.max(days.length - 1, 1) * 840;
   const y = (value: number) => 425 - (value - min) / (max - min) * 260;
   const valueLabel = (value: number) => `${number(value)}${percent ? "%" : ""}`;
   const height = 560 + Math.ceil(series.length / 3) * 60;
   return <InsightChart {...{ title, subtitle, toolbar, footer, filename, emptyMessage, height }} hasData={values.length > 0}>
      {[0, 1, 2, 3, 4].map((tick) => {
         const value = min + (max - min) * tick / 4;
         return <g key={tick}><line x1="190" x2="1030" y1={y(value)} y2={y(value)} stroke="#263247" strokeDasharray="4 6" /><text x="174" y={y(value) + 5} textAnchor="end" fill="#94a3b8" fontSize="13">{value.toLocaleString("en-US", { maximumFractionDigits: 4 })}{percent ? "%" : ""}</text></g>;
      })}
      {min <= 0 && max >= 0 && <line x1="190" x2="1030" y1={y(0)} y2={y(0)} stroke="#64748b" />}
      <text x="190" y="137" fill="#94a3b8" fontSize="12">{axisLabel}</text>
      {days.map((day, index) => (index % 3 === 0 || index === days.length - 1) && <text key={day} x={x(index)} y="451" textAnchor="middle" fill="#94a3b8" fontSize="12">{day.slice(-2)}</text>)}
      {series.map((centre, centreIndex) => {
         let previous = false;
         const path = centre.points.map((point, index) => {
            if (point.value === null) { previous = false; return ""; }
            const part = `${previous ? "L" : "M"}${x(index)},${y(point.value)}`;
            previous = true; return part;
         }).join(" ");
         const legendX = 60 + centreIndex % 3 * 345;
         const legendY = 492 + Math.floor(centreIndex / 3) * 60;
         return <g key={centre.id}>
            <path d={path} fill="none" stroke={centre.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {centre.points.map((point, index) => point.value !== null && <circle key={point.date} cx={x(index)} cy={y(point.value)} r="4" fill={centre.color} stroke="#0b1220" strokeWidth="1.5"><title>{`${centre.name} · ${point.date}: ${valueLabel(point.value)}`}</title></circle>)}
            <circle cx={legendX} cy={legendY - 4} r="5" fill={centre.color} />
            <text x={legendX + 14} y={legendY} fill="#cbd5e1" fontSize="13"><title>{centre.name}</title>{labelLines(centre.name, 34).map((line, index) => <tspan key={index} x={legendX + 14} dy={index ? 16 : 0}>{line}</tspan>)}</text>
         </g>;
      })}
   </InsightChart>;
}
