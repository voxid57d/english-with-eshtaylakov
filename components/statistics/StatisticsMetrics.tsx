"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import { CENTRE_COLORS, monthDays } from "@/lib/marketingMetrics";
import { applyStatisticChanges, parseStatistic, pasteStatisticCells, statisticKey, STATISTIC_UNITS, type StatisticCategory, type StatisticChange, type StatisticDraft, type StatisticsData, type StatisticUnit } from "@/lib/statistics";
import { installUnsavedChangesGuard } from "@/lib/unsavedChanges";
import { useLocalToday } from "@/lib/useLocalToday";
import StatisticsCharts from "./StatisticsCharts";
import shared from "@/components/marketing/marketing.module.css";
import styles from "./statistics.module.css";

type CategoryEditor = Omit<StatisticCategory, "id"> & { id?: string };
const newCategory = (index = 0): CategoryEditor => ({ name: "", color: CENTRE_COLORS[index % CENTRE_COLORS.length], unit: "number" });
const emptyData: StatisticsData = { categories: [], entries: [], canManage: false };
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

async function request(path: string, body?: unknown, signal?: AbortSignal) {
   const token = await getSupabaseAccessToken();
   const response = await fetch(`/api/erp/statistics${path}`, {
      method: body ? "POST" : "GET", cache: "no-store", signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
   });
   const result = await response.json();
   if (!response.ok) throw new Error(result.error || "Could not load statistics.");
   return result;
}

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
   const [drafts, setDrafts] = useState<Record<string, StatisticDraft>>({});
   const [saving, setSaving] = useState(false);
   const [tab, setTab] = useState<"sheet" | "charts">("sheet");
   const [managing, setManaging] = useState(false);
   const [editor, setEditor] = useState<CategoryEditor>(newCategory());
   const [search, setSearch] = useState("");
   const [sheetUnit, setSheetUnit] = useState("");
   const saveLock = useRef(false);
   const days = useMemo(() => monthDays(month), [month]);
   const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
   const draftCount = Object.keys(drafts).length;
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

   useEffect(() => {
      if (draftCount) return installUnsavedChangesGuard("You have unsaved statistics. Leave and discard them?");
   }, [draftCount]);

   const recorded = useMemo(() => new Map(data.entries.map((entry) => [statisticKey(entry.category_id, entry.entry_date), entry.value])), [data.entries]);
   const draftState = useMemo(() => {
      const invalidKeys = new Set<string>();
      const changes: StatisticChange[] = Object.entries(drafts).map(([key, draft]) => {
         let value: number | null = null;
         try { value = parseStatistic(draft.text); } catch { invalidKeys.add(key); }
         return { category_id: draft.category_id, entry_date: draft.entry_date, value };
      });
      return { invalidKeys, entries: applyStatisticChanges(data.entries, changes, month) };
   }, [drafts, data.entries, month]);
   const columns = useMemo(() => data.categories.filter((category) => category.name.toLowerCase().includes(search.toLowerCase()) && (!sheetUnit || category.unit === sheetUnit)), [data.categories, search, sheetUnit]);
   const recordedOnDate = draftState.entries.filter((entry) => entry.entry_date === date).length;
   const monthlyEntryCount = draftState.entries.filter((entry) => entry.entry_date.startsWith(month)).length;
   const availableCells = days.length * data.categories.length;

   const updateDrafts = useCallback((updates: StatisticDraft[]) => {
      setDrafts((previous) => {
         const next = { ...previous };
         for (const draft of updates) {
            const key = statisticKey(draft.category_id, draft.entry_date);
            try {
               if (parseStatistic(draft.text) === (recorded.get(key) ?? null)) { delete next[key]; continue; }
            } catch { /* Invalid input stays editable and prevents saving. */ }
            next[key] = draft;
         }
         return next;
      });
      setNotice("");
   }, [recorded]);

   function paste(event: ClipboardEvent<HTMLInputElement>, row: number, column: number) {
      const text = event.clipboardData.getData("text/plain");
      if (!/[\t\r\n]/.test(text)) return;
      event.preventDefault();
      try { updateDrafts(pasteStatisticCells(text, days, columns, row, column)); setError(""); }
      catch (cause) { setError(`Nothing pasted. ${cause instanceof Error ? cause.message : "Paste numeric cells without headers."}`); }
   }

   async function saveEntries() {
      if (saveLock.current || !data.canManage || !draftCount) return;
      saveLock.current = true; setSaving(true); setError(""); setNotice("");
      const snapshot = { ...drafts };
      try {
         const changes = Object.values(snapshot).map(({ text, ...entry }) => ({ ...entry, value: parseStatistic(text) }));
         await request("", { action: "saveEntries", changes });
         setData((previous) => ({ ...previous, entries: applyStatisticChanges(previous.entries, changes, month) }));
         setDrafts((previous) => Object.fromEntries(Object.entries(previous).filter(([key, value]) => value !== snapshot[key])));
         setNotice(`Saved ${changes.length} ${changes.length === 1 ? "cell" : "cells"}.`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed. Your edits are still here."); }
      finally { saveLock.current = false; setSaving(false); }
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

   function changeMonth(value: string) {
      try {
         const nextDays = monthDays(value);
         setMonth(value); setDate(value === today.slice(0, 7) ? today : nextDays[0]); setNotice("");
      } catch { /* A native month picker may temporarily emit an incomplete value. */ }
   }

   async function deleteCategory() {
      if (saveLock.current || !data.canManage || !editor.id) return;
      const category = data.categories.find((item) => item.id === editor.id);
      if (!category || !window.confirm(`Delete "${category.name}"? This permanently removes the category and all its saved figures across every month, plus its unsaved entries. This cannot be undone.`)) return;
      saveLock.current = true; setSaving(true); setError(""); setNotice("");
      try {
         await request("", { action: "deleteCategory", id: category.id });
         setData((previous) => ({ ...previous,
            categories: previous.categories.filter((item) => item.id !== category.id),
            entries: previous.entries.filter((entry) => entry.category_id !== category.id),
         }));
         setDrafts((previous) => Object.fromEntries(Object.entries(previous).filter(([, draft]) => draft.category_id !== category.id)));
         setEditor(newCategory());
         setNotice(`Deleted "${category.name}" and its figures.`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the category. Please retry."); }
      finally { saveLock.current = false; setSaving(false); }
   }

   return <div className={shared.workspace}>
      <header className={shared.header}>
         <div><p className={shared.eyebrow}>DAILY PERFORMANCE</p><h1>Statistics<span>.</span></h1><p className={shared.description}>Your daily figures, with a clearer view of what changes.</p></div>
         <div className={shared.headerActions}>
            <label className={shared.field}>Reporting month<input type="month" min="1900-01" max="2199-12" value={month} disabled={saving} onChange={(event) => changeMonth(event.target.value)} /></label>
            {data.canManage && <button className={shared.secondary} disabled={!ready || saving} onClick={() => setManaging(!managing)}>{managing ? "Close categories" : "+ Categories"}</button>}
         </div>
      </header>
      {loadError && <div className={shared.error} role="alert">{loadError}<button onClick={() => setRevision((value) => value + 1)}>Retry</button></div>}
      {error && <div className={shared.error} role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
      {notice && <p className={shared.notice} role="status">{notice}</p>}
      {!ready ? <p className={shared.loading}>{loading ? "Loading statistics…" : "Statistics could not be loaded."}</p> : <>
         {managing && data.canManage && <section className={shared.setup} aria-label="Manage categories">
            <h2>Your categories</h2><p>Create a column for any figure you track, such as active students or debt. Select a category to edit it.</p>
            <div className={shared.chips}>{data.categories.map((category) => <button key={category.id} disabled={saving} onClick={() => setEditor(category)}><i style={{ background: category.color }} />{category.name}</button>)}</div>
            <form className={shared.entityForm} onSubmit={(event) => void saveCategory(event)}>
               <label className={`${shared.field} ${styles.nameField}`}>Category name<input required maxLength={80} placeholder="e.g. Active students" value={editor.name} disabled={saving} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
               <label className={shared.field}>Unit<select value={editor.unit} disabled={saving} onChange={(event) => setEditor({ ...editor, unit: event.target.value as StatisticUnit })}>{Object.entries(STATISTIC_UNITS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
               <label className={shared.field}>Chart color<input type="color" value={editor.color} disabled={saving} onChange={(event) => setEditor({ ...editor, color: event.target.value })} /></label>
               <button className={shared.primary} disabled={saving}>{editor.id ? "Update category" : "Add category"}</button>
               {editor.id && <button type="button" className={shared.secondary} disabled={saving} onClick={() => setEditor(newCategory(data.categories.length))}>Cancel edit</button>}
               {editor.id && <button type="button" className={`${shared.secondary} ${styles.deleteButton}`} disabled={saving} onClick={() => void deleteCategory()}>Delete category</button>}
            </form>
            {editor.id && <p>Changes to the name, unit, and color apply to this category across all months.</p>}
         </section>}
         <section className={shared.stats} aria-label="Statistics summary">
            <div><span>Categories</span><strong>{data.categories.length}</strong><small>Figures you track</small></div>
            <div><span>Recorded on {date.slice(5)}</span><strong>{recordedOnDate}<em> / {data.categories.length}</em></strong><small>Daily observations</small></div>
            <div><span>Monthly entries</span><strong>{monthlyEntryCount.toLocaleString("en-US")}</strong><small>{monthLabel}</small></div>
            <div><span>Month coverage</span><strong>{availableCells ? Math.round(monthlyEntryCount / availableCells * 100) : 0}<em>%</em></strong><small>All calendar days · {draftCount ? "Includes unsaved preview" : "Saved figures"}</small></div>
         </section>
         <div className={shared.navigation}>
            <div className={shared.tabs} role="tablist" aria-label="Statistics views">
               <button role="tab" aria-selected={tab === "sheet"} id="statistics-sheet-tab" aria-controls="statistics-panel" onClick={() => setTab("sheet")}>Monthly table</button>
               <button role="tab" aria-selected={tab === "charts"} id="statistics-charts-tab" aria-controls="statistics-panel" onClick={() => setTab("charts")}>Charts & insights</button>
            </div>
            <div className={shared.saveArea}><span aria-live="polite">{draftCount ? `${draftCount} unsaved cells${draftState.invalidKeys.size ? ` · ${draftState.invalidKeys.size} invalid` : ""}` : data.canManage ? "All changes saved" : "View-only access"}</span>
               {data.canManage && <button className={shared.primary} disabled={saving || !draftCount || !!draftState.invalidKeys.size} onClick={() => void saveEntries()}>{saving ? "Saving…" : "Save changes"}</button>}
            </div>
         </div>
         {!data.categories.length ? <section className={shared.empty}>
            <div className={shared.emptyIcon}>↗</div><h2>Start with your first category</h2><p>Create categories for debt, students, groups, trial lessons, or any other daily figure. Each category becomes a column in your monthly table.</p>
            {data.canManage && <button className={shared.primary} onClick={() => setManaging(true)}>+ Add a category</button>}
         </section> : <section id="statistics-panel" role="tabpanel" aria-labelledby={`statistics-${tab === "sheet" ? "sheet" : "charts"}-tab`}>
            {tab === "sheet" ? <div className={shared.sheetCard}>
               <div className={shared.sheetHeader}>
                  <div><h2>{monthLabel}</h2><p>Dates down the left, categories across the top. Paste numeric cells without headers.<br />Blank = unrecorded; 0 = zero. Up to two decimal places.</p></div>
                  <div className={shared.filters}>
                     <label className={shared.field}>Find category<input type="search" placeholder="Search categories…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                     <label className={shared.field}>Unit<select value={sheetUnit} onChange={(event) => setSheetUnit(event.target.value)}><option value="">All units</option>{Object.entries(STATISTIC_UNITS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  </div>
               </div>
               <div className={shared.tableScroll} tabIndex={0} aria-label="Monthly statistics table; scroll horizontally for more categories">
                  <table className={styles.table}>
                     <caption className={shared.srOnly}>Daily statistics for {monthLabel}</caption>
                     <thead><tr><th scope="col">Date</th>{columns.map((category) => <th scope="col" key={category.id}><i style={{ background: category.color }} />{category.name}<small>{STATISTIC_UNITS[category.unit]}</small></th>)}</tr></thead>
                     <tbody>{days.map((day, rowIndex) => <tr key={day} className={day === today ? styles.today : ""}>
                        <th scope="row"><strong>{day.slice(-2)}</strong><small>{new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</small></th>
                        {columns.map((category, columnIndex) => {
                           const key = statisticKey(category.id, day);
                           const draft = drafts[key];
                           const invalid = draftState.invalidKeys.has(key);
                           return <td key={category.id} className={invalid ? styles.invalid : draft ? styles.edited : ""}>
                              <input aria-label={`${category.name}, ${day}`} aria-invalid={invalid} title={`${category.name} · ${day} · ${STATISTIC_UNITS[category.unit]}`} inputMode="decimal" autoComplete="off" placeholder="—"
                                 value={draft ? draft.text : recorded.has(key) ? numberFormat.format(recorded.get(key)!) : ""} readOnly={!data.canManage || saving}
                                 onChange={(event) => updateDrafts([{ category_id: category.id, entry_date: day, text: event.target.value }])}
                                 onPaste={(event) => { if (data.canManage && !saving) paste(event, rowIndex, columnIndex); }}
                                 onKeyDown={(event) => {
                                    if (event.key !== "Enter") return;
                                    event.preventDefault();
                                    const inputs = event.currentTarget.closest("tbody")?.querySelectorAll("input");
                                    inputs?.[Math.min((rowIndex + 1) * columns.length + columnIndex, days.length * columns.length - 1)]?.focus();
                                 }} />
                           </td>;
                        })}
                     </tr>)}</tbody>
                  </table>
               </div>
               {!columns.length && <p className={shared.loading}>No categories match your filters.</p>}
               <footer className={shared.sheetFooter}><span>{days.length} days · {columns.length} categories · Tab moves right, Enter moves down</span><span>Edits stay in this page across months until saved.</span></footer>
            </div> : <>
               {draftCount > 0 && <p className={shared.previewNote}>Charts include unsaved figures. Save changes before sharing.{draftState.invalidKeys.size ? " Invalid cells are excluded." : ""}</p>}
               <StatisticsCharts categories={data.categories} entries={draftState.entries} days={days} date={date} monthLabel={monthLabel} onDateChange={setDate} />
            </>}
         </section>}
      </>}
   </div>;
}
