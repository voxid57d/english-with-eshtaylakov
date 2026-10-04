import type { MarketingEntry } from "./marketingMetrics";

export function calendarCoverage(entries: MarketingEntry[], centreIds: string[], platformId: string) {
   const selected = new Set(centreIds);
   const counts = new Map<string, Set<string>>();
   for (const entry of entries) {
      if (entry.platform_id !== platformId || !selected.has(entry.centre_id)) continue;
      const centres = counts.get(entry.entry_date) || new Set<string>();
      centres.add(entry.centre_id);
      counts.set(entry.entry_date, centres);
   }
   return new Map([...counts].map(([date, centres]) => [date, { count: centres.size, complete: selected.size > 0 && centres.size === selected.size }]));
}
