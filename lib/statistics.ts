import { monthDays, previousDate } from "@/lib/marketingMetrics";

export const STATISTIC_UNITS = { number: "Numbers", UZS: "UZS", USD: "USD", percent: "Percent (%)" } as const;
export type StatisticUnit = keyof typeof STATISTIC_UNITS;
export type StatisticCategory = { id: string; name: string; color: string; unit: StatisticUnit };
// A reading is one check-in: the current total of any categories at one moment.
export type StatisticReading = { id: string; recorded_at: string; note: string | null; values: Record<string, number> };
export type StatisticReadingInput = { id?: string; recorded_at: string; note: string | null; values: { category_id: string; value: number }[] };
export type StatisticsData = { categories: StatisticCategory[]; readings: StatisticReading[]; canManage: boolean };
export type StatisticPoint = { at: number; recorded_at: string; reading_id: string; value: number };

export const MAX_STATISTIC_VALUE = 999_999_999_999.99;
// Days before the month that are loaded so changes can start from the last earlier figure.
export const STATISTIC_LOOKBACK_DAYS = 14;
// Daily change compares with the last figure of an earlier day at most this many days back.
export const STATISTIC_CHANGE_LOOKBACK_DAYS = 7;
// Statistics days and times are Tashkent time (UTC+5, no daylight saving).
export const STATISTICS_UTC_OFFSET = "+05:00";
const OFFSET_MS = 5 * 3600_000;
const DAY_MS = 86400_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseStatistic(value: string): number | null {
   const text = value.trim();
   if (!text) return null;
   if (!/^-?(\d+|\d{1,3}(,\d{3})+|\d{1,3}( \d{3})+)(\.\d{1,2})?$/.test(text)) throw new Error("Enter a number with up to two decimal places, for example 23,758,000 or 125.50.");
   const number = Number(text.replace(/[, ]/g, ""));
   if (!Number.isFinite(number) || Math.abs(number) > MAX_STATISTIC_VALUE) throw new Error("This figure is too large.");
   return number;
}

/** Tashkent calendar date (YYYY-MM-DD) of an instant. */
export function statisticDate(instant: string | number) {
   return new Date((typeof instant === "number" ? instant : Date.parse(instant)) + OFFSET_MS).toISOString().slice(0, 10);
}

/** Tashkent clock time (HH:MM) of an instant. */
export function statisticTime(instant: string | number) {
   return new Date((typeof instant === "number" ? instant : Date.parse(instant)) + OFFSET_MS).toISOString().slice(11, 16);
}

/** UTC ISO instant for a Tashkent date and HH:MM time. */
export function statisticInstant(date: string, time: string) {
   if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Choose a valid date and time.");
   const instant = new Date(`${date}T${time}:00${STATISTICS_UTC_OFFSET}`);
   if (Number.isNaN(instant.getTime()) || statisticDate(instant.getTime()) !== date) throw new Error("Choose a valid date and time.");
   return instant.toISOString();
}

/** Loaded range for a month: the lookback days before it through the end of the month (exclusive). */
export function statisticMonthWindow(month: string) {
   const days = monthDays(month);
   return { from: statisticInstant(previousDate(days[0], STATISTIC_LOOKBACK_DAYS), "00:00"), to: statisticInstant(previousDate(days[days.length - 1], -1), "00:00") };
}

export function validateStatisticReading(body: unknown, now = Date.now()): StatisticReadingInput {
   if (!body || typeof body !== "object") throw new Error("Enter at least one figure.");
   const item = body as Record<string, unknown>;
   if (item.id !== undefined && item.id !== null && (typeof item.id !== "string" || !uuid.test(item.id))) throw new Error("Choose a valid entry.");
   if (typeof item.recorded_at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(item.recorded_at)) throw new Error("Choose a valid date and time.");
   const at = Date.parse(item.recorded_at);
   if (Number.isNaN(at) || statisticDate(at) < "1900-01-01" || statisticDate(at) > "2199-12-31") throw new Error("Choose a valid date and time.");
   if (at > now + 5 * 60_000) throw new Error("An entry cannot be in the future.");
   const note = item.note === undefined || item.note === null ? "" : item.note;
   if (typeof note !== "string" || note.trim().length > 200) throw new Error("Keep the note under 200 characters.");
   if (!Array.isArray(item.values) || !item.values.length) throw new Error("Enter at least one figure.");
   if (item.values.length > 500) throw new Error("An entry can hold up to 500 figures.");
   const seen = new Set<string>();
   const values = item.values.map((value) => {
      if (!value || typeof value !== "object" || typeof value.category_id !== "string" || !uuid.test(value.category_id)) throw new Error("Choose a valid category.");
      if (seen.has(value.category_id)) throw new Error("A category can appear only once in an entry.");
      seen.add(value.category_id);
      if (typeof value.value !== "number") throw new Error("Figures must be numbers.");
      parseStatistic(String(value.value));
      return { category_id: value.category_id, value: value.value };
   });
   return { ...(item.id ? { id: item.id as string } : {}), recorded_at: new Date(at).toISOString(), note: note.trim() || null, values };
}

export function validateStatisticCategory(body: { id?: unknown; name?: unknown; color?: unknown; unit?: unknown }) {
   if (body.id !== undefined && (typeof body.id !== "string" || !uuid.test(body.id))) throw new Error("Choose a valid category.");
   const name = typeof body.name === "string" ? body.name.trim() : "";
   if (!name || name.length > 80) throw new Error("Enter a category name of 1–80 characters.");
   if (typeof body.color !== "string" || !/^#[0-9a-f]{6}$/i.test(body.color)) throw new Error("Choose a valid chart color.");
   if (typeof body.unit !== "string" || !Object.hasOwn(STATISTIC_UNITS, body.unit)) throw new Error("Choose a valid unit.");
   return { name, color: body.color, unit: body.unit as StatisticUnit };
}

export function sortReadings(readings: StatisticReading[]) {
   return [...readings].sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at) || a.id.localeCompare(b.id));
}

/** Every recorded figure of one category, oldest first. */
export function categoryPoints(readings: StatisticReading[], categoryId: string): StatisticPoint[] {
   return sortReadings(readings).flatMap((reading) => Object.hasOwn(reading.values, categoryId)
      ? [{ at: Date.parse(reading.recorded_at), recorded_at: reading.recorded_at, reading_id: reading.id, value: reading.values[categoryId] }] : []);
}

const round = (value: number) => Number(value.toFixed(2));

/** The figure recorded just before this reading for the category, for "+120 since last entry". */
export function changeSincePrevious(readings: StatisticReading[], readingId: string, categoryId: string) {
   const points = categoryPoints(readings, categoryId);
   const index = points.findIndex((point) => point.reading_id === readingId);
   return index > 0 ? round(points[index].value - points[index - 1].value) : null;
}

/**
 * Latest figure on `date` compared with the last figure of the latest earlier day
 * (at most `lookback` days back), plus the change since the entry just before it.
 */
export function dayChange(readings: StatisticReading[], categoryId: string, date: string, lookback = STATISTIC_CHANGE_LOOKBACK_DAYS) {
   const points = categoryPoints(readings, categoryId);
   const dayStart = Date.parse(statisticInstant(date, "00:00"));
   const index = points.findLastIndex((point) => point.at >= dayStart && point.at < dayStart + DAY_MS);
   if (index < 0) return null;
   const current = points[index];
   const previous = points.findLast((point) => point.at < dayStart && point.at >= dayStart - lookback * DAY_MS) ?? null;
   const step = index > 0 ? points[index - 1] : null;
   return {
      value: current.value, recorded_at: current.recorded_at,
      change: previous ? round(current.value - previous.value) : null, since: previous?.recorded_at ?? null,
      stepChange: step ? round(current.value - step.value) : null, stepSince: step?.recorded_at ?? null,
   };
}

/** From the last figure before the month (or the first in it) to the latest figure in the month. */
export function monthChange(readings: StatisticReading[], categoryId: string, month: string) {
   const days = monthDays(month);
   const start = Date.parse(statisticInstant(days[0], "00:00"));
   const end = Date.parse(statisticInstant(previousDate(days[days.length - 1], -1), "00:00"));
   const points = categoryPoints(readings, categoryId).filter((point) => point.at < end);
   const inMonth = points.filter((point) => point.at >= start);
   const first = points.findLast((point) => point.at < start) ?? inMonth[0];
   const last = inMonth.at(-1);
   if (!first || !last || first === last) return null;
   const change = round(last.value - first.value);
   return { change, percent: first.value > 0 ? change / first.value * 100 : null, start: first.recorded_at, end: last.recorded_at };
}

/** Figures within one day, starting from the last figure before it (shown faded) when there is one. */
export function dayPoints(readings: StatisticReading[], categoryId: string, date: string, lookback = STATISTIC_CHANGE_LOOKBACK_DAYS) {
   const dayStart = Date.parse(statisticInstant(date, "00:00"));
   const points = categoryPoints(readings, categoryId);
   return {
      before: points.findLast((point) => point.at < dayStart && point.at >= dayStart - lookback * DAY_MS) ?? null,
      points: points.filter((point) => point.at >= dayStart && point.at < dayStart + DAY_MS),
   };
}
