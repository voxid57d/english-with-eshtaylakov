"use client";

import { useMemo, useState } from "react";
import MarketingChart, { type ChartPresentation } from "@/components/marketing/MarketingChart";
import { STATISTIC_UNITS, type StatisticCategory, type StatisticEntry, type StatisticUnit } from "@/lib/statistics";
import shared from "@/components/marketing/marketing.module.css";
import styles from "./statistics.module.css";

export default function StatisticsCharts({ categories, entries, days, date, monthLabel, onDateChange }: {
   categories: StatisticCategory[]; entries: StatisticEntry[]; days: string[];
   date: string; monthLabel: string; onDateChange: (date: string) => void;
}) {
   const [unitChoice, setUnitChoice] = useState<StatisticUnit | "">("");
   const [excluded, setExcluded] = useState<Set<string>>(new Set());
   const units = [...new Set(categories.map((category) => category.unit))];
   const unit = unitChoice && units.includes(unitChoice) ? unitChoice : units[0];
   const matching = categories.filter((category) => category.unit === unit);
   const selected = matching.filter((category) => !excluded.has(category.id));
   const chartEntries = useMemo(() => entries.map((entry) => ({ centre_id: entry.category_id, platform_id: "statistics", entry_date: entry.entry_date, subscribers: entry.value })), [entries]);
   const label = unit ? STATISTIC_UNITS[unit] : "Numbers";
   const presentation = (kind: "daily" | "trend" | "growth"): ChartPresentation => ({
      title: kind === "daily" ? "Daily category comparison" : kind === "trend" ? "Monthly category trends" : "Change over the month",
      subtitle: `${label} · ${kind === "daily" ? date : monthLabel}`,
      toolbar: kind === "daily" ? "01 / DAILY SNAPSHOT" : kind === "trend" ? "02 / MONTHLY TRENDS" : "03 / MONTHLY CHANGE",
      axisLabel: label.toUpperCase(),
      footer: kind === "daily" ? "Recorded figures on the selected date only" : kind === "trend" ? "Gaps indicate unrecorded days" : "First to last recorded date per category; periods may differ",
      filename: `statistics-${unit}-${kind}-${kind === "daily" ? date : days[0].slice(0, 7)}.jpg`,
      emptyMessage: kind === "growth" ? "Record at least two dates for a selected category to see its change." : `Add figures for the selected categories${kind === "daily" ? ` on ${date}` : " this month"}.`,
   });

   return <div className={shared.charts}>
      <div className={shared.chartFilters}>
         <div><h2>Choose what to compare</h2><p>Compare categories with the same unit. Each chart downloads as a JPG.</p></div>
         <div className={shared.filters}>
            <label className={shared.field}>Chart unit<select value={unit || ""} onChange={(event) => setUnitChoice(event.target.value as StatisticUnit)}>{units.map((item) => <option key={item} value={item}>{STATISTIC_UNITS[item]}</option>)}</select></label>
            <label className={shared.field}>Daily snapshot<input type="date" min={days[0]} max={days[days.length - 1]} value={date} onChange={(event) => { if (days.includes(event.target.value)) onDateChange(event.target.value); }} /></label>
         </div>
      </div>
      <fieldset className={styles.categoryPicker}>
         <legend>Categories in these charts</legend>
         {matching.map((category) => <label key={category.id}><input type="checkbox" checked={!excluded.has(category.id)} onChange={(event) => setExcluded((previous) => {
            const next = new Set(previous);
            if (event.target.checked) next.delete(category.id); else next.add(category.id);
            return next;
         })} /><i style={{ background: category.color }} />{category.name}</label>)}
      </fieldset>
      {!selected.length ? <p className={shared.loading}>Select at least one category to draw charts.</p> : (["daily", "trend", "growth"] as const).map((kind) => <MarketingChart
         key={kind} kind={kind} centres={selected} entries={chartEntries} platformId="statistics" platformName={label}
         days={days} date={date} monthLabel={monthLabel} presentation={presentation(kind)}
      />)}
      <p className={shared.chartHint}>Monthly change compares each category’s first and last recorded dates, shown on the chart. Daily figures are not added together across the month, since balances and cumulative counts may be snapshots.</p>
   </div>;
}
