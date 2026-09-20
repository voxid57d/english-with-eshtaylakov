import { monthDays, previousDate } from "@/lib/marketingMetrics";

export const STATISTIC_UNITS = { number: "Numbers", UZS: "UZS", USD: "USD", percent: "Percent (%)" } as const;
export type StatisticUnit = keyof typeof STATISTIC_UNITS;
export type StatisticCategory = { id: string; name: string; color: string; unit: StatisticUnit };
export type StatisticEntry = { category_id: string; entry_date: string; value: number };
export type StatisticChange = Omit<StatisticEntry, "value"> & { value: number | null };
export type StatisticDraft = Omit<StatisticEntry, "value"> & { text: string };
export type StatisticsData = { categories: StatisticCategory[]; entries: StatisticEntry[]; canManage: boolean };
export const MAX_STATISTIC_VALUE = 999_999_999_999.99;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function statisticKey(categoryId: string, date: string) { return `${categoryId}|${date}`; }

export function parseStatistic(value: string): number | null {
   const text = value.trim();
   if (!text) return null;
   if (!/^-?(\d+|\d{1,3}(,\d{3})+|\d{1,3}( \d{3})+)(\.\d{1,2})?$/.test(text)) throw new Error("Enter a number with up to two decimal places, for example 23,758,000 or 125.50.");
   const number = Number(text.replace(/[, ]/g, ""));
   if (!Number.isFinite(number) || Math.abs(number) > MAX_STATISTIC_VALUE) throw new Error("This figure is too large.");
   return number;
}

export function validateStatisticChanges(value: unknown): StatisticChange[] {
   if (!Array.isArray(value) || !value.length || value.length > 5000) throw new Error("Save between 1 and 5,000 cells at a time.");
   const seen = new Set<string>();
   return value.map((item) => {
      if (!item || typeof item !== "object" || typeof item.category_id !== "string" || !uuid.test(item.category_id)) throw new Error("Choose a valid category.");
      if (typeof item.entry_date !== "string" || !monthDays(item.entry_date.slice(0, 7)).includes(item.entry_date)) throw new Error("Choose a valid entry date.");
      if (item.value !== null) {
         if (typeof item.value !== "number") throw new Error("Figures must be numbers or blank.");
         parseStatistic(String(item.value));
      }
      const key = statisticKey(item.category_id, item.entry_date);
      if (seen.has(key)) throw new Error("A cell cannot be saved twice in one request.");
      seen.add(key);
      return { category_id: item.category_id, entry_date: item.entry_date, value: item.value };
   });
}

export function validateStatisticCategory(body: { id?: unknown; name?: unknown; color?: unknown; unit?: unknown }) {
   if (body.id !== undefined && (typeof body.id !== "string" || !uuid.test(body.id))) throw new Error("Choose a valid category.");
   const name = typeof body.name === "string" ? body.name.trim() : "";
   if (!name || name.length > 80) throw new Error("Enter a category name of 1–80 characters.");
   if (typeof body.color !== "string" || !/^#[0-9a-f]{6}$/i.test(body.color)) throw new Error("Choose a valid chart color.");
   if (typeof body.unit !== "string" || !Object.hasOwn(STATISTIC_UNITS, body.unit)) throw new Error("Choose a valid unit.");
   return { name, color: body.color, unit: body.unit as StatisticUnit };
}

// Spreadsheet rows map to dates; columns map to the currently visible categories.
export function pasteStatisticCells(text: string, days: string[], categories: StatisticCategory[], row: number, column: number): StatisticDraft[] {
   const grid = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
   if (row < 0 || column < 0 || row + grid.length > days.length || grid.some((cells) => column + cells.length > categories.length)) throw new Error("The pasted range extends beyond the visible table.");
   return grid.flatMap((cells, r) => cells.map((text, c) => {
      parseStatistic(text);
      return { category_id: categories[column + c].id, entry_date: days[row + r], text: text.trim() };
   }));
}

export function applyStatisticChanges(entries: StatisticEntry[], changes: StatisticChange[], month: string): StatisticEntry[] {
   const baselineDate = previousDate(`${month}-01`);
   const inRange = (date: string) => date.startsWith(`${month}-`) || date === baselineDate;
   const next = new Map(entries.filter((entry) => inRange(entry.entry_date)).map((entry) => [statisticKey(entry.category_id, entry.entry_date), entry]));
   for (const change of changes) {
      if (!inRange(change.entry_date)) continue;
      const key = statisticKey(change.category_id, change.entry_date);
      if (change.value === null) next.delete(key);
      else next.set(key, { ...change, value: change.value });
   }
   return [...next.values()];
}
