export type MarketingCentre = { id: string; name: string; color: string };
export type MarketingPlatform = { id: string; name: string; logo_data_url?: string | null };
export type MarketingProfileLink = { centre_id: string; platform_id: string; url: string };
export type MarketingEntry = { centre_id: string; platform_id: string; entry_date: string; subscribers: number };
export type MarketingChange = Omit<MarketingEntry, "subscribers"> & { subscribers: number | null };
export type MarketingData = { centres: MarketingCentre[]; platforms: MarketingPlatform[]; entries: MarketingEntry[]; profileLinks: MarketingProfileLink[]; canManage: boolean };

export function parseProfileLink(value: unknown): string {
   if (typeof value !== "string" || !value.trim() || value.length > 2048 || /\s/.test(value.trim())) throw new Error("Enter a valid social profile link.");
   const text = value.trim();
   let url: URL;
   try {
      url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text.replace(/^\/\//, "")}`);
   } catch { throw new Error("Enter a valid social profile link."); }
   if (!["https:", "http:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password || url.href.length > 2048) throw new Error("Use an http or https profile link without login details.");
   return url.href;
}

export const CENTRE_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#06b6d4", "#8b5cf6", "#f97316", "#3b82f6"];
export const MAX_SUBSCRIBERS = 999_999_999_999;

export function monthDays(month: string) {
   if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Choose a valid month (1900–2199).");
   const [year, number] = month.split("-").map(Number);
   const length = new Date(Date.UTC(year, number, 0)).getUTCDate();
   return Array.from({ length }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

export function entryKey(centreId: string, platformId: string, date: string) {
   return `${centreId}|${platformId}|${date}`;
}

export function previousDate(date: string, days = 1) {
   const previous = new Date(`${date}T00:00:00Z`);
   previous.setUTCDate(previous.getUTCDate() - days);
   return previous.toISOString().slice(0, 10);
}

// Require both calendar dates; never substitute an earlier observation or zero.
export function dailyChanges(centres: MarketingCentre[], entries: MarketingEntry[], platformId: string, date: string) {
   return platformSeries(centres, entries, platformId, [previousDate(date), date]).map((centre) => {
      const [previous, current] = centre.points;
      return { ...centre, value: previous.value === null || current.value === null ? null : Number((current.value - previous.value).toFixed(2)) };
   });
}

export function trendBounds(values: number[]) {
   if (!values.length) return { min: 0, max: 1 };
   const min = values.reduce((a, b) => Math.min(a, b));
   const max = values.reduce((a, b) => Math.max(a, b));
   // A constant series needs a nonzero range to draw a horizontal line.
   const padding = Math.max(Math.abs(min) * 0.01, 1);
   return min === max ? { min: min - padding, max: max + padding } : { min, max };
}

// Blank means unrecorded. Only explicit zero means zero subscribers.
export function parseSubscribers(value: string): number | null {
   const trimmed = value.trim();
   if (!trimmed) return null;
   if (!/^(\d+|\d{1,3}(,\d{3})+|\d{1,3}( \d{3})+)$/.test(trimmed)) {
      throw new Error("Use a whole subscriber count, for example 183,873.");
   }
   const count = Number(trimmed.replace(/[, ]/g, ""));
   if (!Number.isSafeInteger(count) || count > MAX_SUBSCRIBERS) throw new Error("Subscriber count is too large.");
   return count;
}

export function validateChanges(value: unknown): MarketingChange[] {
   if (!Array.isArray(value) || !value.length || value.length > 5000) throw new Error("Save between 1 and 5,000 cells at a time.");
   const seen = new Set<string>();
   const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
   return value.map((item) => {
      if (!item || typeof item !== "object" || !uuid.test(item.centre_id) || !uuid.test(item.platform_id)) throw new Error("Choose a valid centre and platform.");
      if (typeof item.entry_date !== "string" || !monthDays(item.entry_date.slice(0, 7)).includes(item.entry_date)) throw new Error("Choose a valid entry date.");
      if (item.subscribers !== null && (typeof item.subscribers !== "number" || !Number.isSafeInteger(item.subscribers) || item.subscribers < 0 || item.subscribers > MAX_SUBSCRIBERS)) throw new Error("Subscriber counts must be non-negative whole numbers.");
      const key = entryKey(item.centre_id, item.platform_id, item.entry_date);
      if (seen.has(key)) throw new Error("The same cell cannot be saved twice in one request.");
      seen.add(key);
      return { centre_id: item.centre_id, platform_id: item.platform_id, entry_date: item.entry_date, subscribers: item.subscribers };
   });
}

export function platformSeries(centres: MarketingCentre[], entries: MarketingEntry[], platformId: string, days: string[]) {
   const values = new Map(entries.filter((entry) => entry.platform_id === platformId).map((entry) => [entryKey(entry.centre_id, platformId, entry.entry_date), entry.subscribers]));
   return centres.map((centre) => ({ ...centre, points: days.map((date) => ({ date, value: values.get(entryKey(centre.id, platformId, date)) ?? null })) }));
}

export function growthBetween(points: { date: string; value: number | null }[]) {
   const recorded = points.filter((point): point is { date: string; value: number } => point.value !== null);
   if (recorded.length < 2) return null;
   const first = recorded[0];
   const last = recorded[recorded.length - 1];
   return { change: last.value - first.value, percent: first.value === 0 ? null : (last.value - first.value) / first.value * 100, start: first.date, end: last.date };
}

export function dailyAudienceTotals(centres: MarketingCentre[], platforms: MarketingPlatform[], entries: MarketingEntry[], date: string) {
   const platformIds = new Set(platforms.map((platform) => platform.id));
   const observations = new Map<string, Map<string, number>>();
   for (const entry of entries) {
      if (entry.entry_date !== date || !platformIds.has(entry.platform_id)) continue;
      const centre = observations.get(entry.centre_id) || new Map<string, number>();
      centre.set(entry.platform_id, entry.subscribers);
      observations.set(entry.centre_id, centre);
   }
   return centres.map((centre) => {
      const values = observations.get(centre.id);
      return {
         ...centre,
         value: values?.size ? [...values.values()].reduce((sum, count) => sum + count, 0) : null,
         recordedPlatforms: values?.size || 0,
         totalPlatforms: platformIds.size,
      };
   });
}
