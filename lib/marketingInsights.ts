import { entryKey, platformSeries, previousDate, type MarketingCentre, type MarketingEntry } from "./marketingMetrics";

export type AudienceSeries = ReturnType<typeof platformSeries>;

// Every row uses the same endpoints; missing dates are never replaced by nearby observations.
export function comparisonGrowth(centres: MarketingCentre[], entries: MarketingEntry[], platformId: string, start: string, end: string) {
   return platformSeries(centres, entries, platformId, [start, end]).map((centre) => {
      const [first, last] = centre.points;
      const change = start < end && first.value !== null && last.value !== null ? last.value - first.value : null;
      return { ...centre, change, percent: change !== null && first.value !== null && first.value > 0 ? change / first.value * 100 : null };
   });
}

export function momentumSeries(centres: MarketingCentre[], entries: MarketingEntry[], platformId: string, days: string[]): AudienceSeries {
   const counts = new Map(entries.map((entry) => [entryKey(entry.centre_id, entry.platform_id, entry.entry_date), entry.subscribers]));
   return platformSeries(centres, entries, platformId, days).map((centre) => ({ ...centre, points: centre.points.map((point) => {
      const baseline = counts.get(entryKey(centre.id, platformId, previousDate(point.date, 7)));
      return { date: point.date, value: point.value !== null && baseline !== undefined ? point.value - baseline : null };
   }) }));
}

export function audienceShareSeries(centres: MarketingCentre[], entries: MarketingEntry[], platformId: string, days: string[]): AudienceSeries {
   const series = platformSeries(centres, entries, platformId, days);
   const totals = days.map((_, index) => {
      if (series.some((centre) => centre.points[index].value === null)) return null;
      return series.reduce((sum, centre) => sum + centre.points[index].value!, 0);
   });
   return series.map((centre) => ({ ...centre, points: centre.points.map((point, index) => ({
      date: point.date, value: point.value !== null && totals[index] !== null && totals[index]! > 0 ? point.value / totals[index]! * 100 : null,
   })) }));
}

export function competitorGapSeries(centres: MarketingCentre[], entries: MarketingEntry[], platformId: string, days: string[], focusId: string, competitorId: string): AudienceSeries {
   const series = platformSeries(centres, entries, platformId, days);
   const focus = series.find((centre) => centre.id === focusId);
   const competitor = series.find((centre) => centre.id === competitorId);
   if (!focus || !competitor || focusId === competitorId) return [];
   return [{ ...focus, name: `${focus.name} minus ${competitor.name}`, points: focus.points.map((point, index) => ({
      date: point.date, value: point.value !== null && competitor.points[index].value !== null ? point.value - competitor.points[index].value! : null,
   })) }];
}
