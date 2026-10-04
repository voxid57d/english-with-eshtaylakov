"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CalendarInput from "@/components/ui/CalendarInput";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import type { MarketingEntry } from "@/lib/marketingMetrics";
import { calendarCoverage } from "@/lib/marketingCalendar";
import styles from "./marketing.module.css";

export default function MarketingDatePicker({ label, value, min, max, start, end, entries, loadedMonth, centreIds, platformId, platformName, onChange }: {
   label: string; value: string; min: string; max: string; start: string; end: string;
   entries: MarketingEntry[]; loadedMonth: string; centreIds: string[]; platformId: string; platformName: string; onChange: (date: string) => void;
}) {
   const [month, setMonth] = useState("");
   const [cache, setCache] = useState<Record<string, MarketingEntry[]>>({});
   const [failure, setFailure] = useState({ month: "", message: "" });
   const [retry, setRetry] = useState(0);
   const known = month === loadedMonth || Object.hasOwn(cache, month);
   const coverage = useMemo(() => calendarCoverage(month === loadedMonth ? entries : cache[month] || [], centreIds, platformId), [month, loadedMonth, entries, cache, centreIds, platformId]);
   const onMonthChange = useCallback((next: string) => setMonth(next), []);
   const error = failure.month === month ? failure.message : "";
   useEffect(() => {
      if (!month || known) return;
      const controller = new AbortController();
      async function load() {
         try {
            const token = await getSupabaseAccessToken();
            if (controller.signal.aborted) return;
            const response = await fetch(`/api/erp/marketing?month=${month}`, { cache: "no-store", signal: controller.signal, headers: { Authorization: `Bearer ${token}` } });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "Could not check recorded dates.");
            if (!controller.signal.aborted) {
               setCache((previous) => ({ ...previous, [month]: payload.entries }));
               setFailure({ month: "", message: "" });
            }
         } catch (cause) {
            if (!controller.signal.aborted) setFailure({ month, message: cause instanceof Error ? cause.message : "Could not check recorded dates." });
         }
      }
      void load();
      return () => controller.abort();
   }, [known, month, retry]);

   return <div className={styles.field}><CalendarInput label={label} value={value} min={min} max={max} start={start} end={end} required onMonthChange={onMonthChange} onChange={(event) => onChange(event.target.value)}
      recording={{ context: `${platformName} ? ${centreIds.length} selected ${centreIds.length === 1 ? "centre" : "centres"}`, known, coverage, total: centreIds.length, noun: "centres", allLabel: "All centres", someLabel: "Some centres", error,
         onRetry: () => { setFailure({ month: "", message: "" }); setRetry((value) => value + 1); } }} />
   </div>;
}
