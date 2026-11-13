"use client";

import { useState } from "react";
import CalendarInput from "@/components/ui/CalendarInput";
import { calendarCoverage } from "@/lib/marketingCalendar";
import { monthDays } from "@/lib/marketingMetrics";
import { STATISTIC_CHANGE_LOOKBACK_DAYS, STATISTIC_UNITS, statisticDate, type StatisticCategory, type StatisticReading, type StatisticUnit } from "@/lib/statistics";
import StatisticsChart, { type StatisticsChartKind, type StatisticsChartText } from "./StatisticsChart";
import shared from "@/components/marketing/marketing.module.css";
import styles from "./statistics.module.css";

const KINDS: StatisticsChartKind[] = ["latest", "day", "trend", "month"];

export default function StatisticsCharts({ categories, readings, month, date, monthLabel, onDateChange }: {
   categories: StatisticCategory[]; readings: StatisticReading[]; month: string;
   date: string; monthLabel: string; onDateChange: (date: string) => void;
}) {
   const [unitChoice, setUnitChoice] = useState<StatisticUnit | "">("");
   const [excluded, setExcluded] = useState<Set<string>>(new Set());
   const days = monthDays(month);
   const units = [...new Set(categories.map((category) => category.unit))];
   const unit = unitChoice && units.includes(unitChoice) ? unitChoice : units[0];
   const matching = categories.filter((category) => category.unit === unit);
   const selected = matching.filter((category) => !excluded.has(category.id));
   const label = unit ? STATISTIC_UNITS[unit] : "Numbers";
   // The date picker marks days on which the selected categories have entries.
   const coverage = calendarCoverage(readings.flatMap((reading) => Object.entries(reading.values).map(([category_id, value]) => ({
      centre_id: category_id, platform_id: "statistics", entry_date: statisticDate(reading.recorded_at), subscribers: value,
   }))), selected.map((category) => category.id), "statistics");
   const dayLabel = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

   const copy: Record<StatisticsChartKind, Omit<StatisticsChartText, "axisLabel" | "filename">> = {
      latest: {
         title: "Change on the day", subtitle: `${label} · ${dayLabel}, latest entry vs the previous day’s last entry`, toolbar: "01 / CHANGE ON THE DAY",
         footer: `Latest figure on the day minus the last figure of an earlier day (up to ${STATISTIC_CHANGE_LOOKBACK_DAYS} days back)`,
         emptyMessage: `Record a figure on ${dayLabel} and on an earlier day within ${STATISTIC_CHANGE_LOOKBACK_DAYS} days for a selected category to see its change.`, periodLabel: date,
      },
      day: {
         title: "Through the day", subtitle: `${label} · ${dayLabel}, every entry from 00:00 to 24:00`, toolbar: "02 / DAY VIEW",
         footer: "Dots are entries; the hollow dot is the last figure before this day", emptyMessage: `No entries on ${dayLabel} for the selected categories.`, periodLabel: date,
      },
      trend: {
         title: "Over the month", subtitle: `${label} · ${monthLabel}, every entry at its recorded time`, toolbar: "03 / MONTHLY TREND",
         footer: "Dots are entries; dashed lines cross days without entries", emptyMessage: "Add entries for the selected categories this month.", periodLabel: monthLabel,
      },
      month: {
         title: "Change over the month", subtitle: `${label} · ${monthLabel}`, toolbar: "04 / MONTHLY CHANGE",
         footer: "From the last figure before the month (or the first in it) to the latest figure", emptyMessage: "Record at least two figures for a selected category to see its change.", periodLabel: monthLabel,
      },
   };
   const text = (kind: StatisticsChartKind): StatisticsChartText => ({
      ...copy[kind], axisLabel: label.toUpperCase(),
      filename: `statistics-${unit}-${kind}-${kind === "latest" || kind === "day" ? date : month}.jpg`,
   });

   return <div className={shared.charts}>
      <div className={shared.chartFilters}>
         <div><h2>Choose what to compare</h2><p>Compare categories with the same unit. Each chart downloads as a JPG.</p></div>
         <div className={shared.filters}>
            <label className={shared.field}>Chart unit<select value={unit || ""} onChange={(event) => setUnitChoice(event.target.value as StatisticUnit)}>{units.map((item) => <option key={item} value={item}>{STATISTIC_UNITS[item]}</option>)}</select></label>
            <label className={shared.field}>Day<CalendarInput aria-label="Day for the daily charts" recording={{ context: `${label} · ${selected.length} selected categories`, known: true, coverage, total: selected.length, noun: "categories", allLabel: "All categories", someLabel: "Some categories" }} type="date" min={days[0]} max={days[days.length - 1]} value={date} onChange={(event) => { if (days.includes(event.target.value)) onDateChange(event.target.value); }} /></label>
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
      {!selected.length ? <p className={shared.loading}>Select at least one category to draw charts.</p>
         : KINDS.map((kind) => <StatisticsChart key={kind} kind={kind} categories={selected} readings={readings} month={month} date={date} text={text(kind)} />)}
      <p className={shared.chartHint}>Figures are totals at the moment of each entry, in Tashkent time. Days without entries never break a chart: changes compare with the latest earlier figure.</p>
   </div>;
}
