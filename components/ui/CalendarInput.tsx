"use client";

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { monthDays, previousDate } from "@/lib/marketingMetrics";
import styles from "./CalendarInput.module.css";

const months = Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(2000, index)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }));
const years = Array.from({ length: 300 }, (_, index) => 1900 + index);
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const formatDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export type CalendarRecording = {
   context: string; known: boolean; error?: string; onRetry?: () => void;
   coverage: ReadonlyMap<string, { complete: boolean; count: number }>;
   total: number; noun: string; allLabel: string; someLabel: string;
};
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
   type?: "date" | "month" | "datetime-local"; value?: string; label?: string;
   start?: string; end?: string; recording?: CalendarRecording; onMonthChange?: (month: string) => void;
};

export default function CalendarInput({ type = "date", value = "", label, min, max, start = "", end = "", recording, onMonthChange, onChange, disabled, required, className, placeholder, name, id: providedId, ...attributes }: Props) {
   const generatedId = useId();
   const id = providedId || generatedId;
   const root = useRef<HTMLDivElement>(null);
   const popup = useRef<HTMLDivElement>(null);
   const trigger = useRef<HTMLButtonElement>(null);
   const input = useRef<HTMLInputElement>(null);
   const [open, setOpen] = useState(false);
   const [month, setMonth] = useState((value || today()).slice(0, 7));
   const [focusDate, setFocusDate] = useState((value || today()).slice(0, 10));
   const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 500 });
   const [invalid, setInvalid] = useState(false);
   const [portalHost, setPortalHost] = useState<Element | null>(null);
   const dateValue = value.slice(0, 10);
   const minimum = String(min || (type === "month" ? "1900-01" : type === "datetime-local" ? "1900-01-01T00:00" : "1900-01-01"));
   const maximum = String(max || (type === "month" ? "2199-12" : type === "datetime-local" ? "2199-12-31T23:59" : "2199-12-31"));
   const dayMin = type === "month" ? `${minimum}-01` : minimum.slice(0, 10);
   const dayMax = type === "month" ? monthDays(maximum).at(-1)! : maximum.slice(0, 10);
   const calendarDays = monthDays(month);
   const offset = new Date(`${calendarDays[0]}T12:00:00Z`).getUTCDay();
   const selected = type === "month" ? `${value}-01` : dateValue;
   const shown = !value ? placeholder || (type === "month" ? "Choose month" : "Choose date") : type === "month" ? `${months[Number(value.slice(5)) - 1]} ${value.slice(0, 4)}` : `${formatDate(dateValue)}${type === "datetime-local" ? ` · ${value.slice(11, 16)}` : ""}`;
   const accessibleLabel = attributes["aria-label"] || label || (type === "month" ? "Choose month" : "Choose date");

   const locate = useCallback(() => {
      const bounds = trigger.current?.getBoundingClientRect();
      if (!bounds) return;
      const availableBelow = window.innerHeight - bounds.bottom - 16;
      const above = availableBelow < 380 && bounds.top > availableBelow;
      const available = above ? bounds.top - 20 : availableBelow;
      const popupHeight = Math.min(popup.current?.scrollHeight || 440, Math.max(120, available));
      setPosition({ left: Math.max(16, Math.min(bounds.left, window.innerWidth - 336)), top: above ? Math.max(12, bounds.top - popupHeight - 8) : bounds.bottom + 8, maxHeight: Math.max(120, available) });
   }, []);

   function close(restore = false) { setOpen(false); if (restore) trigger.current?.focus(); }
   function show() {
      if (disabled) return;
      setPortalHost(trigger.current?.closest("dialog") || document.body);
      const initial = (value || today()).slice(0, type === "month" ? 7 : 10);
      const clamped = initial < minimum.slice(0, initial.length) ? minimum.slice(0, initial.length) : initial > maximum.slice(0, initial.length) ? maximum.slice(0, initial.length) : initial;
      setMonth(clamped.slice(0, 7)); setFocusDate(type === "month" ? `${clamped}-01` : clamped); locate(); setOpen(true);
   }
   function emit(next: string) {
      if (!input.current) return;
      input.current.value = next;
      onChange?.({ target: input.current, currentTarget: input.current, type: "change" } as ChangeEvent<HTMLInputElement>);
      setInvalid(false);
   }
   function choose(date: string) {
      emit(type === "datetime-local" ? `${date}T${value.slice(11, 16) || "00:00"}` : date);
      if (type !== "datetime-local") close(true);
   }

   useEffect(() => {
      if (input.current) input.current.setCustomValidity(value && (value < minimum || value > maximum) ? "Choose a date within the allowed range." : "");
   }, [value, minimum, maximum]);
   useEffect(() => {
      if (!open) return;
      onMonthChange?.(month);
   }, [open, month, onMonthChange]);
   useEffect(() => {
      if (!open) return;
      const frame = requestAnimationFrame(locate);
      const focused = document.activeElement;
      if (focused === trigger.current || focused === document.body || popup.current?.querySelector("[data-date]") === focused) popup.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();
      if (type === "month" && (focused === trigger.current || focused === document.body)) (popup.current?.querySelector<HTMLButtonElement>("[data-month][aria-pressed=true]") || popup.current?.querySelector<HTMLButtonElement>("[data-month]:not(:disabled)"))?.focus();
      function outside(event: PointerEvent) {
         if (!root.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false);
      }
      function focusOutside(event: FocusEvent) {
         if (event.relatedTarget && !root.current?.contains(event.relatedTarget as Node) && !popup.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }
      document.addEventListener("pointerdown", outside); document.addEventListener("focusout", focusOutside);
      window.addEventListener("resize", locate); window.addEventListener("scroll", locate, true);
      return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside); document.removeEventListener("focusout", focusOutside); window.removeEventListener("resize", locate); window.removeEventListener("scroll", locate, true); };
   }, [open, focusDate, month, locate, type]);

   function navigate(next: string) {
      setMonth(next);
      setFocusDate(monthDays(next).find((date) => date >= dayMin && date <= dayMax) || `${next}-01`);
   }
   function move(delta: number) {
      const next = new Date(`${month}-01T12:00:00Z`);
      if (type === "month") next.setUTCFullYear(next.getUTCFullYear() + delta); else next.setUTCMonth(next.getUTCMonth() + delta);
      const nextMonth = next.toISOString().slice(0, 7);
      if (nextMonth >= "1900-01" && nextMonth <= "2199-12") navigate(nextMonth);
   }
   function keyboard(event: KeyboardEvent<HTMLElement>) {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
      const date = (event.target as HTMLElement).dataset.date;
      if (!date || type === "month") return;
      const shift = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
      if (shift === undefined) return;
      event.preventDefault();
      const next = previousDate(date, -shift);
      if (next < dayMin || next > dayMax) return;
      setFocusDate(next); setMonth(next.slice(0, 7));
      // Focus follows arrow navigation even when a month boundary is crossed.
      requestAnimationFrame(() => popup.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());
   }
   const calendar: ReactNode = open && !disabled && <div ref={popup} id={`${id}-calendar`} className={styles.popover} role="dialog" aria-label={accessibleLabel} onKeyDown={keyboard} style={{ left: position.left, top: position.top, maxHeight: position.maxHeight, overflowY: "auto" }}>
      <div className={styles.calendarHeading}><span>{type === "month" ? "CHOOSE A MONTH" : "CHOOSE A DATE"}</span><button type="button" aria-label="Close calendar" onClick={() => close(true)}>×</button></div>
      <div className={styles.calendarNavigation}>
         <button type="button" aria-label={type === "month" ? "Previous year" : "Previous month"} disabled={type === "month" ? month.slice(0, 4) <= minimum.slice(0, 4) : month <= dayMin.slice(0, 7)} onClick={() => move(-1)}>‹</button>
         {type !== "month" && <select aria-label="Calendar month" value={month.slice(5)} onChange={(event) => navigate(`${month.slice(0, 4)}-${event.target.value}`)}>{months.map((text, index) => { const option = String(index + 1).padStart(2, "0"); const candidate = `${month.slice(0, 4)}-${option}`; return <option key={text} value={option} disabled={candidate < dayMin.slice(0, 7) || candidate > dayMax.slice(0, 7)}>{text}</option>; })}</select>}
         <select aria-label="Calendar year" value={month.slice(0, 4)} onChange={(event) => { const candidate = `${event.target.value}-${month.slice(5)}`; navigate(candidate < dayMin.slice(0, 7) ? dayMin.slice(0, 7) : candidate > dayMax.slice(0, 7) ? dayMax.slice(0, 7) : candidate); }}>{years.map((year) => <option key={year} value={year} disabled={String(year) < minimum.slice(0, 4) || String(year) > maximum.slice(0, 4)}>{year}</option>)}</select>
         <button type="button" aria-label={type === "month" ? "Next year" : "Next month"} disabled={type === "month" ? month.slice(0, 4) >= maximum.slice(0, 4) : month >= dayMax.slice(0, 7)} onClick={() => move(1)}>›</button>
      </div>
      {recording && <p className={styles.calendarContext}>{recording.context}</p>}
      {type === "month" ? <div className={styles.monthGrid}>{months.map((text, index) => {
         const option = `${month.slice(0, 4)}-${String(index + 1).padStart(2, "0")}`;
         return <button key={text} type="button" data-month={option} disabled={option < minimum || option > maximum} aria-pressed={option === value} onClick={() => choose(option)}>{text.slice(0, 3)}</button>;
      })}</div> : <>
         <div className={styles.calendarWeekdays} aria-hidden="true">{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span key={day}>{day}</span>)}</div>
         <div className={styles.calendarGrid} role="group" aria-label="Calendar dates">
            {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} />)}
            {calendarDays.map((date) => {
               const recorded = recording?.coverage.get(date);
               const status = !recording ? "" : recording.known ? recorded ? `${recorded.count} of ${recording.total} ${recording.noun} recorded${recorded.complete ? "; complete data" : "; partial data"}` : "No recorded data" : recording.error ? "Data unavailable" : "Checking data";
               return <button key={date} type="button" data-date={date} data-selected={date === selected} data-in-range={!!start && date >= start && date <= end} data-coverage={recording?.known && recorded ? recorded.complete ? "complete" : "partial" : undefined}
                  className={styles.calendarDay} disabled={date < dayMin || date > dayMax} tabIndex={date === focusDate ? 0 : -1} aria-pressed={date === selected} aria-label={`${formatDate(date)}${status ? `: ${status}` : ""}`} title={status || undefined}
                  onClick={() => choose(date)}><span>{Number(date.slice(-2))}</span><i aria-hidden="true" /></button>;
            })}
         </div>
      </>}
      {recording && <><div className={styles.calendarLegend}><span><i data-coverage="complete" />{recording.allLabel}</span><span><i data-coverage="partial" />{recording.someLabel}</span><span><i />No data</span></div>
         <p className={styles.calendarStatus} role="status">{recording.known ? "Dots show recorded counts, including zero." : recording.error || "Checking this month’s recorded dates…"}{!recording.known && recording.error && <button type="button" onClick={recording.onRetry}>Retry</button>}</p></>}
      {type === "datetime-local" && <label className={styles.timeField}>Time<input type="time" aria-label="Time" value={value.slice(11, 16) || "00:00"} onChange={(event) => { if (event.target.value) emit(`${dateValue || focusDate}T${event.target.value}`); }} /></label>}
      {invalid && <p role="alert" className={styles.calendarStatus}>Please choose {type === "month" ? "a month" : "a date"}.</p>}
      <div className={styles.calendarFooter}>{!required ? <button type="button" onClick={() => { emit(""); close(true); }}>Clear</button> : <span />}{type === "datetime-local" && <button type="button" onClick={() => close(true)}>Done</button>}<button type="button" disabled={(type === "month" ? today().slice(0, 7) : today()) < minimum.slice(0, type === "month" ? 7 : 10) || (type === "month" ? today().slice(0, 7) : today()) > maximum.slice(0, type === "month" ? 7 : 10)} onClick={() => choose(type === "month" ? today().slice(0, 7) : today())}>{type === "month" ? "This month" : "Today"}</button></div>
   </div>;

   return <div ref={root} className={styles.picker} onKeyDown={keyboard}>
      {label && <span id={`${id}-label`}>{label}</span>}
      <input {...attributes} ref={input} id={id} name={name} type="text" className={styles.validationInput} tabIndex={-1} aria-hidden="true" value={value} onChange={onChange} required={required} disabled={disabled} onInvalid={(event) => { event.preventDefault(); setInvalid(true); show(); }} />
      <button ref={trigger} type="button" className={`${styles.trigger} ${className || ""}`} disabled={disabled} aria-label={`${accessibleLabel}: ${shown}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-calendar` : undefined} onClick={() => open ? close() : show()}>
         <span>{shown}</span><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 11h18" /></svg>
      </button>
      {portalHost ? createPortal(calendar, portalHost) : calendar}
   </div>;
}
