import { monthDays, previousDate } from "@/lib/marketingMetrics";

export const STATISTIC_UNITS = { number: "Numbers", UZS: "UZS", USD: "USD", percent: "Percent (%)" } as const;
export type StatisticUnit = keyof typeof STATISTIC_UNITS;
export const STATISTIC_KINDS = { total: "Running total (carries over)", monthly: "Monthly counter (restarts each month)" } as const;
export type StatisticKind = keyof typeof STATISTIC_KINDS;
export const STATISTIC_DIRECTIONS = { up: "Higher is better", down: "Lower is better", neutral: "Neutral" } as const;
export type StatisticDirection = keyof typeof STATISTIC_DIRECTIONS;
export type StatisticCategory = { id: string; name: string; color: string; unit: StatisticUnit; kind: StatisticKind; direction: StatisticDirection };
// Functions that need to know how a category behaves across month boundaries.
type CategoryRef = Pick<StatisticCategory, "id" | "kind">;
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

export const MAX_COMPARE_MONTHS = 24;

/** The month `count` months before (negative: after) `month`. */
export function shiftMonth(month: string, count: number) {
   const [year, number] = month.split("-").map(Number);
   const index = year * 12 + number - 1 - count;
   return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}

/** Months from `from` to `to` inclusive (YYYY-MM), at most MAX_COMPARE_MONTHS. */
export function monthRange(from: string, to: string) {
   monthDays(from); monthDays(to);
   if (from > to) throw new Error("The start month must be on or before the end month.");
   const months = [from];
   while (months[months.length - 1] < to) {
      months.push(shiftMonth(months[months.length - 1], -1));
      if (months.length > MAX_COMPARE_MONTHS) throw new Error(`Compare at most ${MAX_COMPARE_MONTHS} months at a time.`);
   }
   return months;
}

const monthStart = (month: string) => Date.parse(statisticInstant(`${month}-01`, "00:00"));
const monthEnd = (month: string) => monthStart(shiftMonth(month, -1));

/** Loaded range for months: the lookback days before the first through the end of the last (exclusive). */
export function statisticMonthWindow(month: string, until = month) {
   const months = monthRange(month, until);
   return { from: statisticInstant(previousDate(`${months[0]}-01`, STATISTIC_LOOKBACK_DAYS), "00:00"), to: new Date(monthEnd(months[months.length - 1])).toISOString() };
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

export function validateStatisticCategory(body: { id?: unknown; name?: unknown; color?: unknown; unit?: unknown; kind?: unknown; direction?: unknown }) {
   if (body.id !== undefined && (typeof body.id !== "string" || !uuid.test(body.id))) throw new Error("Choose a valid category.");
   const name = typeof body.name === "string" ? body.name.trim() : "";
   if (!name || name.length > 80) throw new Error("Enter a category name of 1–80 characters.");
   if (typeof body.color !== "string" || !/^#[0-9a-f]{6}$/i.test(body.color)) throw new Error("Choose a valid chart color.");
   if (typeof body.unit !== "string" || !Object.hasOwn(STATISTIC_UNITS, body.unit)) throw new Error("Choose a valid unit.");
   const kind = body.kind ?? "total";
   const direction = body.direction ?? "neutral";
   if (typeof kind !== "string" || !Object.hasOwn(STATISTIC_KINDS, kind)) throw new Error("Choose a valid figure type.");
   if (typeof direction !== "string" || !Object.hasOwn(STATISTIC_DIRECTIONS, direction)) throw new Error("Choose a valid direction.");
   return { name, color: body.color, unit: body.unit as StatisticUnit, kind: kind as StatisticKind, direction: direction as StatisticDirection };
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

const sameMonth = (a: number, b: number) => statisticDate(a).slice(0, 7) === statisticDate(b).slice(0, 7);

/**
 * The figure recorded just before this reading for the category, for "+120 since last entry".
 * Monthly counters only compare within the same month, since they restart.
 */
export function changeSincePrevious(readings: StatisticReading[], readingId: string, category: CategoryRef) {
   const points = categoryPoints(readings, category.id);
   const index = points.findIndex((point) => point.reading_id === readingId);
   if (index <= 0) return null;
   const [current, previous] = [points[index], points[index - 1]];
   return category.kind === "monthly" && !sameMonth(current.at, previous.at) ? null : round(current.value - previous.value);
}

/**
 * Latest figure on `date` compared with the last figure of the latest earlier day
 * (at most `lookback` days back), plus the change since the entry just before it.
 * A monthly counter compares with zero when it has no earlier figure in the same month (it restarted).
 */
export function dayChange(readings: StatisticReading[], category: CategoryRef, date: string, lookback = STATISTIC_CHANGE_LOOKBACK_DAYS) {
   const points = categoryPoints(readings, category.id);
   const dayStart = Date.parse(statisticInstant(date, "00:00"));
   const index = points.findLastIndex((point) => point.at >= dayStart && point.at < dayStart + DAY_MS);
   if (index < 0) return null;
   const current = points[index];
   const counter = category.kind === "monthly";
   let previous = points.findLast((point) => point.at < dayStart && point.at >= dayStart - lookback * DAY_MS) ?? null;
   const restarted = counter && (!previous || !sameMonth(previous.at, current.at));
   if (restarted) previous = null;
   let step: StatisticPoint | null = index > 0 ? points[index - 1] : null;
   if (counter && step && !sameMonth(step.at, current.at)) step = null;
   return {
      value: current.value, recorded_at: current.recorded_at, restarted,
      change: previous ? round(current.value - previous.value) : restarted ? current.value : null, since: previous?.recorded_at ?? null,
      stepChange: step ? round(current.value - step.value) : null, stepSince: step?.recorded_at ?? null,
   };
}

/**
 * Change during a month. Running totals: from the last figure before the month (or the first in it)
 * to the latest figure in the month. Monthly counters: the month's latest figure (they start at zero).
 */
export function monthChange(readings: StatisticReading[], category: CategoryRef, month: string) {
   const start = monthStart(month);
   const end = monthEnd(month);
   const points = categoryPoints(readings, category.id).filter((point) => point.at < end);
   const inMonth = points.filter((point) => point.at >= start);
   const last = inMonth.at(-1);
   if (category.kind === "monthly") return last ? { change: last.value, percent: null, start: null as string | null, end: last.recorded_at } : null;
   const first = points.findLast((point) => point.at < start) ?? inMonth[0];
   if (!first || !last || first === last) return null;
   const change = round(last.value - first.value);
   return { change, percent: first.value > 0 ? change / first.value * 100 : null, start: first.recorded_at as string | null, end: last.recorded_at };
}

/** Figures within one day, starting from the last figure before it (shown faded) when there is one. */
export function dayPoints(readings: StatisticReading[], category: CategoryRef, date: string, lookback = STATISTIC_CHANGE_LOOKBACK_DAYS) {
   const dayStart = Date.parse(statisticInstant(date, "00:00"));
   const points = categoryPoints(readings, category.id);
   const before = points.findLast((point) => point.at < dayStart && point.at >= dayStart - lookback * DAY_MS) ?? null;
   return {
      // A monthly counter restarts, so last month's figure is not where today starts.
      before: before && category.kind === "monthly" && !sameMonth(before.at, dayStart) ? null : before,
      points: points.filter((point) => point.at >= dayStart && point.at < dayStart + DAY_MS),
   };
}

/**
 * A month's figure: the latest figure recorded in the month up to the end of day `asOfDay`
 * (whole month when null; short months use their last day). A running total with no entry yet
 * in the month carries the latest earlier figure forward; a monthly counter shows nothing.
 */
export function monthFigure(readings: StatisticReading[], category: CategoryRef, month: string, asOfDay: number | null = null) {
   const start = monthStart(month);
   const end = monthEnd(month);
   const cutoff = asOfDay === null ? end : Math.min(start + Math.max(asOfDay, 1) * DAY_MS, end);
   const last = categoryPoints(readings, category.id).findLast((point) => point.at < cutoff);
   if (!last) return null;
   if (last.at >= start) return { value: last.value, recorded_at: last.recorded_at, carried: false };
   return category.kind === "total" ? { value: last.value, recorded_at: last.recorded_at, carried: true } : null;
}

export type MonthCell = { month: string; value: number | null; change: number | null; carried: boolean; recorded_at: string | null };

/** Each month's figure with its change from the month before (the first month compares with the month before it). */
export function compareMonths(readings: StatisticReading[], category: CategoryRef, months: string[], asOfDay: number | null = null): MonthCell[] {
   const figures = [shiftMonth(months[0], 1), ...months].map((month) => monthFigure(readings, category, month, asOfDay));
   return months.map((month, index) => {
      const figure = figures[index + 1];
      const previous = figures[index];
      return { month, value: figure?.value ?? null, carried: figure?.carried ?? false, recorded_at: figure?.recorded_at ?? null,
         change: figure && previous ? round(figure.value - previous.value) : null };
   });
}

/** One point per day of the month: the latest figure by the end of that day; null for days after `until`. */
export function monthDailySeries(readings: StatisticReading[], category: CategoryRef, month: string, until = Infinity) {
   const start = monthStart(month);
   const points = categoryPoints(readings, category.id);
   return monthDays(month).map((date, index) => {
      const dayStart = start + index * DAY_MS;
      if (dayStart > until) return { day: index + 1, date, value: null as number | null, recorded: false };
      const last = points.findLast((point) => point.at < dayStart + DAY_MS);
      const value = last && (last.at >= start || category.kind === "total") ? last.value : null;
      return { day: index + 1, date, value, recorded: !!last && last.at >= dayStart };
   });
}

/** Whether a change is good, bad or neutral for a category's direction. */
export function changeTone(direction: StatisticDirection, change: number | null): "good" | "bad" | "neutral" {
   if (change === null || change === 0 || direction === "neutral") return "neutral";
   return (change > 0) === (direction === "up") ? "good" : "bad";
}
