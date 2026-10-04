"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import { monthDays, previousDate, type MarketingEntry } from "@/lib/marketingMetrics";
import { calendarCoverage } from "@/lib/marketingCalendar";
import styles from "./marketing.module.css";

const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(2000, index)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }));
const years = Array.from({ length: 300 }, (_, index) => 1900 + index);
const formatDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function MarketingDatePicker({ label, value, min, max, start, end, entries, loadedMonth, centreIds, platformId, platformName, onChange }: {
   label: string; value: string; min: string; max: string; start: string; end: string;
   entries: MarketingEntry[]; loadedMonth: string; centreIds: string[]; platformId: string; platformName: string; onChange: (date: string) => void;
}) {
   const id = useId();
   const root = useRef<HTMLDivElement>(null);
   const trigger = useRef<HTMLButtonElement>(null);
   const [open, setOpen] = useState(false);
   const [month, setMonth] = useState(value.slice(0, 7));
   const [focusDate, setFocusDate] = useState(value);
   const [cache, setCache] = useState<Record<string, MarketingEntry[]>>({});
   const [failure, setFailure] = useState({ month: "", message: "" });
   const [retry, setRetry] = useState(0);
   const calendarDays = monthDays(month);
   const offset = new Date(`${calendarDays[0]}T12:00:00Z`).getUTCDay();
   const known = month === loadedMonth || Object.hasOwn(cache, month);
   const coverage = useMemo(() => calendarCoverage(month === loadedMonth ? entries : cache[month] || [], centreIds, platformId), [month, loadedMonth, entries, cache, centreIds, platformId]);
   const error = failure.month === month ? failure.message : "";

   function close(restoreFocus = false) {
      setOpen(false);
      if (restoreFocus) trigger.current?.focus();
   }

   useEffect(() => {
      if (!open) return;
      function outside(event: PointerEvent) {
         if (!root.current?.contains(event.target as Node)) setOpen(false);
      }
      document.addEventListener("pointerdown", outside);
      return () => document.removeEventListener("pointerdown", outside);
   }, [open]);

   useEffect(() => {
      if (open) root.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();
   }, [open, focusDate, month]);

   useEffect(() => {
      if (!open || known) return;
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
   }, [open, known, month, retry]);

   function navigate(nextMonth: string) {
      const dates = monthDays(nextMonth);
      setMonth(nextMonth);
      const candidate = dates.find((date) => date >= min && date <= max);
      setFocusDate(candidate || dates[0]);
   }

   function moveMonth(delta: number) {
      const next = new Date(`${month}-01T12:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + delta);
      const nextMonth = next.toISOString().slice(0, 7);
      if (nextMonth >= "1900-01" && nextMonth <= "2199-12") navigate(nextMonth);
   }

   function keyboard(event: KeyboardEvent<HTMLDivElement>) {
      if (event.key === "Escape") { event.preventDefault(); close(true); return; }
      const target = event.target as HTMLElement;
      const date = target.dataset.date;
      if (!date) return;
      const shift = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
      if (shift === undefined) return;
      event.preventDefault();
      const next = previousDate(date, -shift);
      if (next < min || next > max) return;
      setFocusDate(next); setMonth(next.slice(0, 7));
   }

   return <div className={`${styles.field} ${styles.datePicker}`} ref={root} onKeyDown={keyboard}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <span id={`${id}-label`}>{label}</span>
      <button ref={trigger} type="button" className={styles.dateTrigger} aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-calendar` : undefined}
         onClick={() => { if (open) close(); else { setMonth(value.slice(0, 7)); setFocusDate(value); setOpen(true); } }}>
         <span id={`${id}-value`}>{formatDate(value)}</span>
         <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 11h18" /></svg>
      </button>
      {open && <div id={`${id}-calendar`} className={styles.datePopover} role="dialog" aria-labelledby={`${id}-label`}>
         <div className={styles.calendarHeading}><span>CHOOSE A DATE</span><button type="button" aria-label="Close calendar" onClick={() => close(true)}>×</button></div>
         <div className={styles.calendarNavigation}>
            <button type="button" aria-label="Previous month" disabled={month === "1900-01"} onClick={() => moveMonth(-1)}>‹</button>
            <select aria-label="Calendar month" value={month.slice(5)} onChange={(event) => navigate(`${month.slice(0, 4)}-${event.target.value}`)}>{months.map((name, index) => <option key={name} value={String(index + 1).padStart(2, "0")}>{name}</option>)}</select>
            <select aria-label="Calendar year" value={month.slice(0, 4)} onChange={(event) => navigate(`${event.target.value}-${month.slice(5)}`)}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select>
            <button type="button" aria-label="Next month" disabled={month === "2199-12"} onClick={() => moveMonth(1)}>›</button>
         </div>
         <p className={styles.calendarContext}>{platformName} · {centreIds.length} selected {centreIds.length === 1 ? "centre" : "centres"}</p>
         <div className={styles.calendarWeekdays} aria-hidden="true">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span key={day}>{day}</span>)}</div>
         <div className={styles.calendarGrid} role="group" aria-label="Calendar dates">
            {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}
            {calendarDays.map((date) => {
               const recorded = coverage.get(date);
               const status = known ? recorded ? `${recorded.count} of ${centreIds.length} centres recorded${recorded.complete ? "; complete data" : "; partial data"}` : "No recorded data" : error ? "Data unavailable" : "Checking data";
               return <button key={date} type="button" data-date={date} data-selected={date === value} data-in-range={date >= start && date <= end} data-coverage={known && recorded ? recorded.complete ? "complete" : "partial" : undefined}
                  className={styles.calendarDay} disabled={date < min || date > max} tabIndex={date === focusDate ? 0 : -1} aria-pressed={date === value} aria-label={`${formatDate(date)}: ${status}`} title={status}
                  onClick={() => { onChange(date); close(true); }}>
                  <span>{Number(date.slice(-2))}</span><i aria-hidden="true" />
               </button>;
            })}
         </div>
         <div className={styles.calendarLegend}><span><i data-coverage="complete" />All centres</span><span><i data-coverage="partial" />Some centres</span><span><i />No data</span></div>
         <p className={styles.calendarStatus} role="status">{known ? "Dots show recorded counts, including zero." : error || "Checking this month’s recorded dates…"}{!known && error && <button type="button" onClick={() => { setFailure({ month: "", message: "" }); setRetry((value) => value + 1); }}>Retry</button>}</p>
      </div>}
   </div>;
}
