"use client";

import CalendarInput from "@/components/ui/CalendarInput";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CENTRE_COLORS, monthDays } from "@/lib/marketingMetrics";
import { changeSincePrevious, parseStatistic, sortReadings, statisticDate, statisticInstant, statisticTime, STATISTIC_DIRECTIONS, STATISTIC_KINDS, STATISTIC_UNITS, type StatisticCategory, type StatisticDirection, type StatisticKind, type StatisticReading, type StatisticsData, type StatisticUnit } from "@/lib/statistics";
import { installUnsavedChangesGuard } from "@/lib/unsavedChanges";
import { useLocalToday } from "@/lib/useLocalToday";
import StatisticsCharts from "./StatisticsCharts";
import StatisticsCompare from "./StatisticsCompare";
import { statisticsRequest as request } from "./statisticsRequest";
import { statisticStamp } from "./StatisticsChart";
import shared from "@/components/marketing/marketing.module.css";
import styles from "./statistics.module.css";

type CategoryEditor = Omit<StatisticCategory, "id"> & { id?: string };
type EntryForm = { id?: string; date: string; time: string; note: string; values: Record<string, string> };
const newCategory = (index = 0): CategoryEditor => ({ name: "", color: CENTRE_COLORS[index % CENTRE_COLORS.length], unit: "number", kind: "total", direction: "neutral" });
const newEntry = (): EntryForm => ({ date: statisticDate(Date.now()), time: statisticTime(Date.now()), note: "", values: {} });
const emptyData: StatisticsData = { categories: [], readings: [], canManage: false };
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const signed = (value: number) => `${value > 0 ? "+" : ""}${numberFormat.format(value)}`;
const dayHeading = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

export default function StatisticsMetrics() {
   const today = useLocalToday();
   const [month, setMonth] = useState(today.slice(0, 7));
   const [date, setDate] = useState(today);
   const [data, setData] = useState<StatisticsData>(emptyData);
   const [loadedMonth, setLoadedMonth] = useState("");
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState("");
   const [error, setError] = useState("");
   const [notice, setNotice] = useState("");
   const [revision, setRevision] = useState(0);
   const [saving, setSaving] = useState(false);
   const [tab, setTab] = useState<"entries" | "charts" | "compare">("entries");
   const [managing, setManaging] = useState(false);
   const [editor, setEditor] = useState<CategoryEditor>(newCategory());
   const [entry, setEntry] = useState<EntryForm>(newEntry);
   const [touched, setTouched] = useState(false);
   const saveLock = useRef(false);
   const formRef = useRef<HTMLFormElement>(null);
   const days = useMemo(() => monthDays(month), [month]);
   const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
   const ready = !loading && loadedMonth === month && !loadError;

   useEffect(() => {
      const controller = new AbortController();
      setLoading(true); setLoadError("");
      request(`?month=${month}`, undefined, controller.signal).then((result: StatisticsData) => {
         if (!controller.signal.aborted) { setData(result); setLoadedMonth(month); }
      }).catch((cause) => {
         if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Could not load statistics.");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
      return () => controller.abort();
   }, [month, revision]);

   // Reload quietly after a save or delete so the page keeps its place.
   const refresh = useCallback(async () => {
      try { setData(await request(`?month=${month}`)); setLoadedMonth(month); }
      catch (cause) { setError(cause instanceof Error ? `Saved, but the list could not refresh: ${cause.message}` : "Saved, but the list could not refresh."); }
   }, [month]);

   useEffect(() => {
      if (touched) return installUnsavedChangesGuard("You have an unsaved statistics entry. Leave and discard it?");
   }, [touched]);

   const readings = useMemo(() => sortReadings(data.readings), [data.readings]);
   const monthReadings = useMemo(() => readings.filter((reading) => statisticDate(reading.recorded_at).startsWith(month)), [readings, month]);
   const logDays = useMemo(() => {
      const groups = new Map<string, StatisticReading[]>();
      for (const reading of [...monthReadings].reverse()) {
         const day = statisticDate(reading.recorded_at);
         groups.set(day, [...(groups.get(day) || []), reading]);
      }
      return [...groups];
   }, [monthReadings]);
   const latest = readings.at(-1);
   const categoriesByUnit = useMemo(() => Object.keys(STATISTIC_UNITS).map((unit) => [unit as StatisticUnit, data.categories.filter((category) => category.unit === unit)] as const).filter(([, items]) => items.length), [data.categories]);

   // Entry form validation: blank = not measured; at least one figure is required.
   const formState = useMemo(() => {
      const invalid = new Set<string>();
      const values: { category_id: string; value: number }[] = [];
      for (const category of data.categories) {
         const text = entry.values[category.id] ?? "";
         try { const value = parseStatistic(text); if (value !== null) values.push({ category_id: category.id, value }); }
         catch { invalid.add(category.id); }
      }
      let recordedAt = "";
      try { recordedAt = statisticInstant(entry.date, entry.time); } catch { /* reported below */ }
      return { invalid, values, recordedAt };
   }, [entry, data.categories]);
   const lastFigure = useCallback((categoryId: string) => {
      const before = formState.recordedAt ? Date.parse(formState.recordedAt) : Date.now();
      return readings.findLast((reading) => reading.id !== entry.id && Object.hasOwn(reading.values, categoryId) && Date.parse(reading.recorded_at) <= before)?.values[categoryId];
   }, [readings, formState.recordedAt, entry.id]);

   function updateEntry(update: Partial<EntryForm>) { setEntry((previous) => ({ ...previous, ...update })); setTouched(true); setNotice(""); }

   function resetEntry() { setEntry(newEntry()); setTouched(false); }

   function editEntry(reading: StatisticReading) {
      if (touched && !window.confirm("Discard the entry you are typing and edit this one instead?")) return;
      setEntry({ id: reading.id, date: statisticDate(reading.recorded_at), time: statisticTime(reading.recorded_at), note: reading.note ?? "",
         values: Object.fromEntries(Object.entries(reading.values).map(([id, value]) => [id, numberFormat.format(value)])) });
      setTouched(false); setNotice(""); setTab("entries");
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
   }

   async function saveEntry(event: FormEvent) {
      event.preventDefault();
      if (saveLock.current || !data.canManage) return;
      if (formState.invalid.size) { setError("Fix the highlighted figures before saving."); return; }
      if (!formState.recordedAt) { setError("Choose a valid date and time."); return; }
      if (!formState.values.length) { setError("Enter at least one figure."); return; }
      saveLock.current = true; setSaving(true); setError(""); setNotice("");
      try {
         await request("", { action: "saveReading", reading: { id: entry.id, recorded_at: formState.recordedAt, note: entry.note, values: formState.values } });
         const stamp = statisticStamp(formState.recordedAt);
         const elsewhere = !entry.date.startsWith(month);
         resetEntry();
         setNotice(`${entry.id ? "Entry updated" : "Entry saved"} for ${stamp}.${elsewhere ? " It belongs to another month; switch months to see it." : ""}`);
         await refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed. Your entry is still here."); }
      finally { saveLock.current = false; setSaving(false); }
   }

   async function deleteEntry(reading: StatisticReading) {
      if (saveLock.current || !data.canManage) return;
      if (!window.confirm(`Delete the entry from ${statisticStamp(reading.recorded_at)}? This removes all ${Object.keys(reading.values).length} figures in it and cannot be undone.`)) return;
      saveLock.current = true; setSaving(true); setError(""); setNotice("");
      try {
         await request("", { action: "deleteReading", id: reading.id });
         if (entry.id === reading.id) resetEntry();
         setNotice(`Deleted the entry from ${statisticStamp(reading.recorded_at)}.`);
         await refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the entry. Please retry."); }
      finally { saveLock.current = false; setSaving(false); }
   }

   // Enter moves to the next figure instead of submitting half-filled entries; the last field saves.
   function nextField(event: KeyboardEvent<HTMLInputElement>) {
      if (event.key !== "Enter") return;
      const inputs = [...(formRef.current?.querySelectorAll<HTMLInputElement>("input[data-figure]") ?? [])];
      const index = inputs.indexOf(event.currentTarget);
      if (index < inputs.length - 1) { event.preventDefault(); inputs[index + 1].focus(); }
   }

   async function saveCategory(event: FormEvent) {
      event.preventDefault();
      if (saveLock.current || !data.canManage) return;
      saveLock.current = true; setSaving(true); setError(""); setNotice("");
      try {
         const result = await request("", { action: "category", ...editor });
         setData((previous) => ({ ...previous, categories: editor.id ? previous.categories.map((category) => category.id === editor.id ? result.category : category) : [...previous.categories, result.category] }));
         setNotice(editor.id ? "Category updated." : "Category added.");
         setEditor(newCategory(data.categories.length + (editor.id ? 0 : 1)));
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the category."); }
      finally { saveLock.current = false; setSaving(false); }
   }

   // Quick settings table: each change saves immediately.
   async function saveCategorySetting(category: StatisticCategory, update: Partial<Pick<StatisticCategory, "kind" | "direction">>) {
      if (saveLock.current || !data.canManage) return;
      saveLock.current = true; setSaving(true); setError(""); setNotice("");
      try {
         const result = await request("", { action: "category", ...category, ...update });
         setData((previous) => ({ ...previous, categories: previous.categories.map((item) => item.id === category.id ? result.category : item) }));
         setNotice(`Updated "${category.name}".`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the category."); }
      finally { saveLock.current = false; setSaving(false); }
   }

   // Open charts on the latest day with entries when the selected day (often today) has none yet.
   function openCharts() {
      setTab("charts");
      if (monthReadings.some((reading) => statisticDate(reading.recorded_at) === date)) return;
      const previous = monthReadings.findLast((reading) => statisticDate(reading.recorded_at) <= date);
      if (previous) setDate(statisticDate(previous.recorded_at));
   }

   function changeMonth(value: string) {
      try {
         const nextDays = monthDays(value);
         setMonth(value); setDate(value === today.slice(0, 7) ? today : nextDays[nextDays.length - 1]); setNotice("");
      } catch { /* A native month picker may temporarily emit an incomplete value. */ }
   }

   async function deleteCategory() {
      if (saveLock.current || !data.canManage || !editor.id) return;
      const category = data.categories.find((item) => item.id === editor.id);
      if (!category || !window.confirm(`Delete "${category.name}"? This permanently removes the category and all its figures from every entry. Entries left with no figures are removed too. This cannot be undone.`)) return;
      saveLock.current = true; setSaving(true); setError(""); setNotice("");
      try {
         await request("", { action: "deleteCategory", id: category.id });
         setEntry((previous) => ({ ...previous, values: Object.fromEntries(Object.entries(previous.values).filter(([id]) => id !== category.id)) }));
         setEditor(newCategory());
         setNotice(`Deleted "${category.name}" and its figures.`);
         await refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the category. Please retry."); }
      finally { saveLock.current = false; setSaving(false); }
   }

   return <div className={shared.workspace}>
      <header className={shared.header}>
         <div><p className={shared.eyebrow}>PERFORMANCE LOG</p><h1>Statistics<span>.</span></h1><p className={shared.description}>Record your figures whenever you check them — morning, afternoon or night.</p></div>
         <div className={shared.headerActions}>
            <label className={shared.field}>Month<CalendarInput aria-label="Month" type="month" min="1900-01" max="2199-12" value={month} disabled={saving} onChange={(event) => changeMonth(event.target.value)} /></label>
            {data.canManage && <button className={shared.secondary} disabled={!ready || saving} onClick={() => setManaging(!managing)}>{managing ? "Close categories" : "+ Categories"}</button>}
         </div>
      </header>
      {loadError && <div className={shared.error} role="alert">{loadError}<button onClick={() => setRevision((value) => value + 1)}>Retry</button></div>}
      {error && <div className={shared.error} role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
      {notice && <p className={shared.notice} role="status">{notice}</p>}
      {!ready ? <p className={shared.loading}>{loading ? "Loading statistics…" : "Statistics could not be loaded."}</p> : <>
         {managing && data.canManage && <section className={shared.setup} aria-label="Manage categories">
            <h2>Your categories</h2><p>Create a category for any figure you track, such as active students or debt. Select a category to edit it.</p>
            <div className={shared.chips}>{data.categories.map((category) => <button key={category.id} disabled={saving} onClick={() => setEditor(category)}><i style={{ background: category.color }} />{category.name}</button>)}</div>
            <form className={shared.entityForm} onSubmit={(event) => void saveCategory(event)}>
               <label className={`${shared.field} ${styles.nameField}`}>Category name<input required maxLength={80} placeholder="e.g. Active students" value={editor.name} disabled={saving} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
               <label className={shared.field}>Unit<select value={editor.unit} disabled={saving} onChange={(event) => setEditor({ ...editor, unit: event.target.value as StatisticUnit })}>{Object.entries(STATISTIC_UNITS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
               <label className={shared.field}>Figure type<select value={editor.kind} disabled={saving} onChange={(event) => setEditor({ ...editor, kind: event.target.value as StatisticKind })}>{Object.entries(STATISTIC_KINDS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
               <label className={shared.field}>Direction<select value={editor.direction} disabled={saving} onChange={(event) => setEditor({ ...editor, direction: event.target.value as StatisticDirection })}>{Object.entries(STATISTIC_DIRECTIONS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
               <label className={shared.field}>Chart color<input type="color" value={editor.color} disabled={saving} onChange={(event) => setEditor({ ...editor, color: event.target.value })} /></label>
               <button className={shared.primary} disabled={saving}>{editor.id ? "Update category" : "Add category"}</button>
               {editor.id && <button type="button" className={shared.secondary} disabled={saving} onClick={() => setEditor(newCategory(data.categories.length))}>Cancel edit</button>}
               {editor.id && <button type="button" className={`${shared.secondary} ${styles.deleteButton}`} disabled={saving} onClick={() => void deleteCategory()}>Delete category</button>}
            </form>
            {editor.id && <p>Changes to the name, unit, and color apply to this category in every entry.</p>}
            {data.categories.length > 0 && <div className={styles.settings}>
               <h3>How each figure behaves</h3>
               <p>Used to compare months. A running total carries over (active students, debt); a monthly counter restarts each month (trial sign-ups, enrolments). Direction colours changes green or red. Changes save immediately.</p>
               <div className={shared.tableScroll}><table className={styles.settingsTable}>
                  <thead><tr><th scope="col">Category</th><th scope="col">Unit</th><th scope="col">Figure type</th><th scope="col">Direction</th></tr></thead>
                  <tbody>{data.categories.map((category) => <tr key={category.id}>
                     <th scope="row"><i style={{ background: category.color }} />{category.name}</th>
                     <td>{STATISTIC_UNITS[category.unit]}</td>
                     <td><select aria-label={`Figure type for ${category.name}`} value={category.kind} disabled={saving} onChange={(event) => void saveCategorySetting(category, { kind: event.target.value as StatisticKind })}>{Object.entries(STATISTIC_KINDS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></td>
                     <td><select aria-label={`Direction for ${category.name}`} value={category.direction} disabled={saving} onChange={(event) => void saveCategorySetting(category, { direction: event.target.value as StatisticDirection })}>{Object.entries(STATISTIC_DIRECTIONS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></td>
                  </tr>)}</tbody>
               </table></div>
            </div>}
         </section>}
         <section className={shared.stats} aria-label="Statistics summary">
            <div><span>Categories</span><strong>{data.categories.length}</strong><small>Figures you track</small></div>
            <div><span>Entries</span><strong>{monthReadings.length.toLocaleString("en-US")}</strong><small>{monthLabel}</small></div>
            <div><span>Last entry</span><strong className={styles.statText}>{latest ? statisticDate(latest.recorded_at) === today ? `Today ${statisticTime(latest.recorded_at)}` : statisticStamp(latest.recorded_at) : "None yet"}</strong><small>Tashkent time</small></div>
            <div><span>Days with entries</span><strong>{logDays.length}<em> / {days.length}</em></strong><small>{monthLabel}</small></div>
         </section>
         <div className={shared.navigation}>
            <div className={shared.tabs} role="tablist" aria-label="Statistics views">
               <button role="tab" aria-selected={tab === "entries"} id="statistics-entries-tab" aria-controls="statistics-panel" onClick={() => setTab("entries")}>Entries</button>
               <button role="tab" aria-selected={tab === "charts"} id="statistics-charts-tab" aria-controls="statistics-panel" onClick={openCharts}>This month</button>
               <button role="tab" aria-selected={tab === "compare"} id="statistics-compare-tab" aria-controls="statistics-panel" onClick={() => setTab("compare")}>Compare months</button>
            </div>
            <div className={shared.saveArea}><span aria-live="polite">{!data.canManage ? "View-only access" : touched ? "Unsaved entry" : "All entries saved"}</span></div>
         </div>
         {!data.categories.length ? <section className={shared.empty}>
            <div className={shared.emptyIcon}>↗</div><h2>Start with your first category</h2><p>Create categories for debt, students, groups, trial lessons, or any other figure. Each entry can hold a figure for every category.</p>
            {data.canManage && <button className={shared.primary} onClick={() => setManaging(true)}>+ Add a category</button>}
         </section> : <section id="statistics-panel" role="tabpanel" aria-labelledby={`statistics-${tab}-tab`}>
            {tab === "entries" ? <div className={styles.entries}>
               {data.canManage && <form ref={formRef} className={`${shared.sheetCard} ${styles.entryForm}`} onSubmit={(event) => void saveEntry(event)} aria-label={entry.id ? "Edit entry" : "New entry"}>
                  <div className={shared.sheetHeader}>
                     <div><h2>{entry.id ? "Edit entry" : "New entry"}</h2><p>Type the current total for anything you checked. Blank = not measured; 0 = zero. Up to two decimal places.</p></div>
                     <div className={shared.filters}>
                        <label className={shared.field}>Date<CalendarInput aria-label="Entry date" type="date" min="1900-01-01" max={today} value={entry.date} disabled={saving} onChange={(event) => { if (event.target.value) updateEntry({ date: event.target.value }); }} /></label>
                        <label className={shared.field}>Time<input type="time" required value={entry.time} disabled={saving} onChange={(event) => updateEntry({ time: event.target.value })} /></label>
                        <button type="button" className={shared.secondary} disabled={saving} onClick={() => updateEntry({ date: statisticDate(Date.now()), time: statisticTime(Date.now()) })}>Now</button>
                     </div>
                  </div>
                  {categoriesByUnit.map(([unit, items]) => <fieldset key={unit} className={styles.figureGroup}>
                     <legend>{STATISTIC_UNITS[unit]}</legend>
                     {items.map((category) => {
                        const last = lastFigure(category.id);
                        const invalid = formState.invalid.has(category.id);
                        return <label key={category.id} className={`${styles.figure} ${invalid ? styles.invalid : ""}`}>
                           <span><i style={{ background: category.color }} />{category.name}</span>
                           <input data-figure inputMode="decimal" autoComplete="off" aria-invalid={invalid} disabled={saving}
                              placeholder={last === undefined ? "—" : `Last: ${numberFormat.format(last)}`}
                              value={entry.values[category.id] ?? ""} onKeyDown={nextField}
                              onChange={(event) => updateEntry({ values: { ...entry.values, [category.id]: event.target.value } })} />
                        </label>;
                     })}
                  </fieldset>)}
                  <div className={styles.entryFooter}>
                     <label className={`${shared.field} ${styles.noteField}`}>Note (optional)<input maxLength={200} placeholder="e.g. after evening classes" value={entry.note} disabled={saving} onChange={(event) => updateEntry({ note: event.target.value })} /></label>
                     <span className={styles.entryCount}>{formState.values.length} of {data.categories.length} figures{formState.invalid.size ? ` · ${formState.invalid.size} invalid` : ""}</span>
                     {(entry.id || touched) && <button type="button" className={shared.secondary} disabled={saving} onClick={resetEntry}>{entry.id ? "Cancel edit" : "Clear"}</button>}
                     <button className={shared.primary} disabled={saving || !formState.values.length || !!formState.invalid.size}>{saving ? "Saving…" : entry.id ? "Update entry" : "Save entry"}</button>
                  </div>
               </form>}
               <section className={`${shared.sheetCard} ${styles.log}`} aria-label={`Entries in ${monthLabel}`}>
                  <div className={shared.sheetHeader}><div><h2>{monthLabel}</h2><p>{monthReadings.length ? `${monthReadings.length} entries on ${logDays.length} days, newest first. Changes are since the previous entry for that category.` : "No entries this month yet."}</p></div></div>
                  {logDays.map(([day, items]) => <div key={day} className={styles.logDay}>
                     <h3>{dayHeading(day)}{day === today && <em>Today</em>}<small>{items.length} {items.length === 1 ? "entry" : "entries"}</small></h3>
                     {items.map((reading) => <article key={reading.id} className={`${styles.logEntry} ${entry.id === reading.id ? styles.editing : ""}`}>
                        <div className={styles.logTime}><strong>{statisticTime(reading.recorded_at)}</strong>{reading.note && <small>{reading.note}</small>}</div>
                        <ul className={styles.logValues}>{data.categories.filter((category) => Object.hasOwn(reading.values, category.id)).map((category) => {
                           const change = changeSincePrevious(readings, reading.id, category);
                           return <li key={category.id} title={`${category.name} · ${STATISTIC_UNITS[category.unit]}`}><i style={{ background: category.color }} /><span>{category.name}</span><b>{numberFormat.format(reading.values[category.id])}</b>
                              {change !== null && <em className={change > 0 ? styles.up : change < 0 ? styles.down : ""}>{signed(change)}</em>}</li>;
                        })}</ul>
                        {data.canManage && <div className={styles.logActions}>
                           <button className={shared.secondary} disabled={saving} onClick={() => editEntry(reading)}>Edit</button>
                           <button className={`${shared.secondary} ${styles.deleteButton}`} disabled={saving} onClick={() => void deleteEntry(reading)}>Delete</button>
                        </div>}
                     </article>)}
                  </div>)}
               </section>
            </div> : tab === "compare" ? <StatisticsCompare categories={data.categories} endMonth={month} today={today} /> : <>
               {touched && <p className={shared.previewNote}>Charts show saved entries only. Save your entry to include it.</p>}
               <StatisticsCharts categories={data.categories} readings={readings} month={month} date={date} monthLabel={monthLabel} onDateChange={setDate} />
            </>}
         </section>}
      </>}
   </div>;
}
