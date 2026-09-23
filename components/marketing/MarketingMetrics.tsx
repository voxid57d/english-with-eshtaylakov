"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import { preparePlatformLogo } from "@/lib/marketingLogo";
import { CENTRE_COLORS, entryKey, monthDays, previousDate, parseSubscribers, type MarketingChange, type MarketingData, type MarketingEntry } from "@/lib/marketingMetrics";
import { installUnsavedChangesGuard } from "@/lib/unsavedChanges";
import { useLocalToday } from "@/lib/useLocalToday";
import MarketingCharts from "./MarketingCharts";
import PlatformProfileLink from "./PlatformProfileLink";
import styles from "./marketing.module.css";

type Draft = { centre_id: string; platform_id: string; entry_date: string; text: string };
type Editor = { kind: "centre" | "platform"; id?: string; name: string; color: string; logo_data_url?: string | null };
const emptyData: MarketingData = { centres: [], platforms: [], entries: [], profileLinks: [], canManage: false };

async function request(path: string, body?: unknown, signal?: AbortSignal) {
   const token = await getSupabaseAccessToken();
   const response = await fetch(`/api/erp/marketing${path}`, {
      method: body ? "POST" : "GET", cache: "no-store", signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
   });
   const payload = await response.json();
   if (!response.ok) throw new Error(payload.error || "Could not load marketing metrics.");
   return payload;
}

export default function MarketingMetrics() {
   const today = useLocalToday();
   const [month, setMonth] = useState(today.slice(0, 7));
   const [date, setDate] = useState(today);
   const [data, setData] = useState<MarketingData>(emptyData);
   const [loadedMonth, setLoadedMonth] = useState("");
   const [loading, setLoading] = useState(true);
   const [loadError, setLoadError] = useState("");
   const [error, setError] = useState("");
   const [notice, setNotice] = useState("");
   const [revision, setRevision] = useState(0);
   const [drafts, setDrafts] = useState<Record<string, Draft>>({});
   const [saving, setSaving] = useState(false);
   const [platform, setPlatform] = useState("");
   const [excludedCentres, setExcludedCentres] = useState<Set<string>>(new Set());
   const [sheetPlatform, setSheetPlatform] = useState("");
   const [search, setSearch] = useState("");
   const [tab, setTab] = useState<"sheet" | "charts">("sheet");
   const [managing, setManaging] = useState(false);
   const [editor, setEditor] = useState<Editor>({ kind: "centre", name: "", color: CENTRE_COLORS[0] });
   const saveLock = useRef(false);
   const days = useMemo(() => monthDays(month), [month]);
   const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
   const draftCount = Object.keys(drafts).length;
   const ready = !loading && loadedMonth === month && !loadError;
   const selectedPlatform = data.platforms.find((item) => item.id === platform) || data.platforms[0];
   const profileLinks = useMemo(() => new Map(data.profileLinks.map((link) => [`${link.centre_id}|${link.platform_id}`, link.url])), [data.profileLinks]);

   async function saveProfileLink(centreId: string, platformId: string, url: string) {
      const result = await request("", { action: "profileLink", centre_id: centreId, platform_id: platformId, url });
      setData((previous) => ({
         ...previous,
         profileLinks: [...previous.profileLinks.filter((link) => link.centre_id !== centreId || link.platform_id !== platformId), result.profileLink],
      }));
   }

   useEffect(() => {
      const controller = new AbortController();
      setLoading(true); setLoadError("");
      request(`?month=${month}`, undefined, controller.signal)
         .then((payload: MarketingData) => {
            if (controller.signal.aborted) return;
            setData(payload); setLoadedMonth(month);
         }).catch((cause) => {
            if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Could not load marketing metrics.");
         }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
      return () => controller.abort();
   }, [month, revision]);

   useEffect(() => {
      if (draftCount) return installUnsavedChangesGuard("You have unsaved marketing entries. Leave and discard them?");
   }, [draftCount]);

   const recorded = useMemo(() => new Map(data.entries.map((entry) => [entryKey(entry.centre_id, entry.platform_id, entry.entry_date), entry.subscribers])), [data.entries]);
   const effectiveEntries = useMemo(() => {
      const entries = new Map(data.entries.map((entry) => [entryKey(entry.centre_id, entry.platform_id, entry.entry_date), entry]));
      for (const [key, draft] of Object.entries(drafts)) {
         if (!draft.entry_date.startsWith(month) && !(draft.entry_date >= previousDate(`${month}-01`, 7) && draft.entry_date < `${month}-01`)) continue;
         try {
            const subscribers = parseSubscribers(draft.text);
            if (subscribers === null) entries.delete(key);
            else entries.set(key, { centre_id: draft.centre_id, platform_id: draft.platform_id, entry_date: draft.entry_date, subscribers });
         } catch { entries.delete(key); }
      }
      return [...entries.values()];
   }, [data.entries, drafts, month]);
   const invalidCount = Object.values(drafts).filter((draft) => { try { parseSubscribers(draft.text); return false; } catch { return true; } }).length;
   const rows = useMemo(() => data.centres.filter((centre) => centre.name.toLowerCase().includes(search.toLowerCase())).flatMap((centre) => data.platforms.filter((item) => !sheetPlatform || item.id === sheetPlatform).map((item) => ({ centre, platform: item }))), [data.centres, data.platforms, search, sheetPlatform]);
   const countsOnDate = effectiveEntries.filter((entry) => entry.entry_date === date);
   const possible = data.centres.length * data.platforms.length;

   const updateDrafts = useCallback((updates: Draft[]) => {
      setDrafts((previous) => {
         const next = { ...previous };
         for (const draft of updates) {
            const key = entryKey(draft.centre_id, draft.platform_id, draft.entry_date);
            try {
               if (parseSubscribers(draft.text) === (recorded.get(key) ?? null)) { delete next[key]; continue; }
            } catch { /* Keep invalid input visible until corrected. */ }
            next[key] = draft;
         }
         return next;
      });
      setNotice("");
   }, [recorded]);

   function pasteCells(event: ClipboardEvent<HTMLInputElement>, rowIndex: number, dayIndex: number) {
      const text = event.clipboardData.getData("text/plain");
      if (!/[\t\n\r]/.test(text)) return;
      event.preventDefault();
      const grid = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
      if (rowIndex + grid.length > rows.length || grid.some((cells) => dayIndex + cells.length > days.length)) {
         setError("The pasted range extends beyond the visible table. Choose a smaller range."); return;
      }
      try {
         const updates = grid.flatMap((cells, r) => cells.map((value, c) => {
            parseSubscribers(value);
            return { centre_id: rows[rowIndex + r].centre.id, platform_id: rows[rowIndex + r].platform.id, entry_date: days[dayIndex + c], text: value.trim() };
         }));
         updateDrafts(updates); setError("");
      } catch (cause) { setError(`Nothing pasted. ${cause instanceof Error ? cause.message : "Paste subscriber counts only, without headers."}`); }
   }

   async function saveEntries() {
      if (saveLock.current || !data.canManage || !draftCount) return;
      saveLock.current = true; setSaving(true); setError(""); setNotice("");
      const snapshot = { ...drafts };
      try {
         const changes: MarketingChange[] = Object.values(snapshot).map(({ text, ...entry }) => ({ ...entry, subscribers: parseSubscribers(text) }));
         await request("", { action: "saveEntries", changes });
         setData((previous) => {
            const entries = new Map(previous.entries.map((entry) => [entryKey(entry.centre_id, entry.platform_id, entry.entry_date), entry]));
            changes.filter((change) => change.entry_date.startsWith(month) || (change.entry_date >= previousDate(`${month}-01`, 7) && change.entry_date < `${month}-01`)).forEach((change) => {
               const key = entryKey(change.centre_id, change.platform_id, change.entry_date);
               if (change.subscribers === null) entries.delete(key);
               else entries.set(key, change as MarketingEntry);
            });
            return { ...previous, entries: [...entries.values()] };
         });
         setDrafts((previous) => Object.fromEntries(Object.entries(previous).filter(([key, value]) => value !== snapshot[key])));
         setNotice(`Saved ${changes.length} ${changes.length === 1 ? "cell" : "cells"}.`);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed. Your edits are still here."); }
      finally { saveLock.current = false; setSaving(false); }
   }

   async function saveEntity(event: FormEvent) {
      event.preventDefault();
      if (saveLock.current || !data.canManage) return;
      saveLock.current = true; setSaving(true); setError(""); setNotice("");
      try {
         const result = await request("", { action: editor.kind, id: editor.id, name: editor.name, color: editor.color, ...(editor.kind === "platform" ? { logo_data_url: editor.logo_data_url ?? null } : {}) });
         setData((previous) => {
            if (editor.kind === "centre") return { ...previous, centres: editor.id ? previous.centres.map((item) => item.id === editor.id ? result.record : item) : [...previous.centres, result.record] };
            return { ...previous, platforms: editor.id ? previous.platforms.map((item) => item.id === editor.id ? result.record : item) : [...previous.platforms, result.record] };
         });
         setNotice(`${editor.kind === "centre" ? "Learning centre" : "Platform"} ${editor.id ? "updated" : "added"}.`);
         setEditor({ kind: editor.kind, name: "", color: CENTRE_COLORS[(data.centres.length + 1) % CENTRE_COLORS.length] });
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this item."); }
      finally { saveLock.current = false; setSaving(false); }
   }

   function changeMonth(value: string) {
      try {
         const nextDays = monthDays(value);
         setMonth(value); setDate(value === today.slice(0, 7) ? today : nextDays[0]); setNotice("");
      } catch { /* The native picker may temporarily return an incomplete month. */ }
   }

   async function uploadLogo(file: File) {
      if (saveLock.current) return;
      saveLock.current = true; setSaving(true); setError("");
      try {
         const logo = await preparePlatformLogo(file);
         setEditor((previous) => ({ ...previous, logo_data_url: logo }));
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the logo."); }
      finally { saveLock.current = false; setSaving(false); }
   }

   return <div className={styles.workspace}>
      <header className={styles.header}><div><p className={styles.eyebrow}>GROWTH INTELLIGENCE</p><h1>Marketing metrics<span>.</span></h1><p className={styles.description}>Track your audience. Understand the competition.</p></div><div className={styles.headerActions}><label className={styles.field}>Reporting month<input type="month" aria-label="Reporting month" min="1900-01" max="2199-12" value={month} disabled={saving} onChange={(event) => changeMonth(event.target.value)} /></label>{data.canManage && <button className={styles.secondary} disabled={!ready || saving} onClick={() => setManaging(!managing)}>{managing ? "Close setup" : "+ Centres & platforms"}</button>}</div></header>
      {loadError && <div className={styles.error} role="alert">{loadError} <button onClick={() => setRevision((value) => value + 1)}>Retry</button></div>}
      {error && <div className={styles.error} role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}>×</button></div>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {!ready ? <div className={styles.loading}>{loading ? "Loading your marketing workspace…" : "Marketing metrics could not be loaded."}</div> : <>
         {managing && data.canManage && <section className={styles.setup} aria-label="Manage centres and platforms"><div><h2>Your comparison set</h2><p>Add a centre or platform, or select an existing item to rename it.</p><div className={styles.chips}>{data.centres.map((centre) => <button disabled={saving} key={centre.id} onClick={() => setEditor({ kind: "centre", ...centre })}><i style={{ background: centre.color }} />{centre.name}</button>)}{data.platforms.map((item) => <button disabled={saving} key={item.id} onClick={() => setEditor({ kind: "platform", ...item, color: CENTRE_COLORS[0] })}>{item.name}</button>)}</div></div><form onSubmit={(event) => void saveEntity(event)} className={styles.entityForm}><label className={styles.field}>Add or edit<select value={editor.kind} disabled={saving} onChange={(event) => setEditor({ kind: event.target.value as Editor["kind"], name: "", color: CENTRE_COLORS[data.centres.length % CENTRE_COLORS.length] })}><option value="centre">Learning centre</option><option value="platform">Social media platform</option></select></label><label className={styles.field}>Name<input required maxLength={editor.kind === "centre" ? 80 : 60} placeholder={editor.kind === "centre" ? "e.g. IELTS ZONE" : "e.g. TikTok"} value={editor.name} disabled={saving} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>{editor.kind === "centre" && <label className={styles.field}>Chart color<input aria-label="Centre chart color" type="color" value={editor.color} disabled={saving} onChange={(event) => setEditor({ ...editor, color: event.target.value })} /></label>}{editor.kind === "platform" && <div className={styles.logoEditor}><label className={styles.field}>Platform logo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadLogo(file); }} /><small>PNG, JPG, WebP ? up to 2 MB</small></label>{editor.logo_data_url && <div className={styles.logoPreview}><svg width="42" height="42" viewBox="0 0 42 42" role="img" aria-label="Platform logo preview"><image href={editor.logo_data_url} width="42" height="42" preserveAspectRatio="xMidYMid meet" /></svg><button type="button" className={styles.secondary} disabled={saving} onClick={() => setEditor({ ...editor, logo_data_url: null })}>Remove logo</button></div>}</div>}<button className={styles.primary} disabled={saving}>{editor.id ? "Update" : "Add"} {editor.kind}</button>{editor.id && <button type="button" className={styles.secondary} disabled={saving} onClick={() => setEditor({ kind: editor.kind, name: "", color: CENTRE_COLORS[data.centres.length % CENTRE_COLORS.length] })}>Cancel edit</button>}</form></section>}
         <section className={styles.stats} aria-label="Workspace summary"><div><span>Learning centres</span><strong>{String(data.centres.length).padStart(2, "0")}</strong><small>Your competitive landscape</small></div><div><span>Social platforms</span><strong>{String(data.platforms.length).padStart(2, "0")}</strong><small>Channels you are tracking</small></div><div><span>Recorded on {date.slice(5)}</span><strong>{countsOnDate.length}<em> / {possible}</em></strong><small>Centre and platform pairs</small></div><div><span>Monthly observations</span><strong>{effectiveEntries.filter((entry) => entry.entry_date.startsWith(month)).length.toLocaleString("en-US")}</strong><small>{draftCount ? "Includes your unsaved preview" : monthLabel}</small></div></section>
         <div className={styles.navigation}><div className={styles.tabs} role="tablist" aria-label="Marketing views"><button role="tab" aria-selected={tab === "sheet"} aria-controls="marketing-panel" id="sheet-tab" onClick={() => setTab("sheet")}>Monthly table</button><button role="tab" aria-selected={tab === "charts"} aria-controls="marketing-panel" id="charts-tab" onClick={() => setTab("charts")}>Charts & insights</button></div><div className={styles.saveArea}><span aria-live="polite">{draftCount ? `${draftCount} unsaved ${draftCount === 1 ? "cell" : "cells"}${invalidCount ? ` · ${invalidCount} invalid` : ""}` : data.canManage ? "All changes saved" : "View-only access"}</span>{data.canManage && <button className={styles.primary} disabled={saving || !draftCount || !!invalidCount} onClick={() => void saveEntries()}>{saving ? "Saving…" : "Save changes"}</button>}</div></div>
         {!data.centres.length || !data.platforms.length ? <section className={styles.empty}><div className={styles.emptyIcon}>↗</div><h2>Build your comparison set</h2><p>Add learning centres and the platforms you compete on. Your monthly table and charts will appear here.</p>{data.canManage && <button className={styles.primary} onClick={() => setManaging(true)}>+ Add centres & platforms</button>}</section> :
            <section id="marketing-panel" role="tabpanel" aria-labelledby={`${tab === "sheet" ? "sheet" : "charts"}-tab`}>
               {tab === "sheet" ? <div className={styles.sheetCard}><div className={styles.sheetHeader}><div><h2>{monthLabel}</h2><p>Enter counts daily, or paste a range from a spreadsheet. Blank = unrecorded; 0 = zero.</p></div><div className={styles.filters}><label className={styles.field}>Find centre<input type="search" placeholder="Search centres…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className={styles.field}>Platform<select value={sheetPlatform} onChange={(event) => setSheetPlatform(event.target.value)}><option value="">All platforms</option>{data.platforms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div></div>
                  <div className={styles.tableScroll} tabIndex={0} aria-label="Monthly subscriber entry table, scroll horizontally for more days"><table className={styles.table}><caption className={styles.srOnly}>Daily subscriber counts for {monthLabel}</caption><thead><tr><th scope="col">Learning centre</th><th scope="col">Platform</th>{days.map((day) => <th scope="col" key={day} className={day === today ? styles.today : ""}><span>{day.slice(-2)}</span><small>{new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</small></th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={`${row.centre.id}-${row.platform.id}`}><th scope="row"><i style={{ background: row.centre.color }} />{row.centre.name}</th><td><PlatformProfileLink centreName={row.centre.name} platformName={row.platform.name} url={profileLinks.get(`${row.centre.id}|${row.platform.id}`)} canManage={data.canManage} onSave={(url) => saveProfileLink(row.centre.id, row.platform.id, url)} /></td>{days.map((day, dayIndex) => {
                     const key = entryKey(row.centre.id, row.platform.id, day);
                     const draft = drafts[key];
                     const value = draft ? draft.text : recorded.has(key) ? recorded.get(key)!.toLocaleString("en-US") : "";
                     let invalid = false;
                     if (draft) { try { parseSubscribers(draft.text); } catch { invalid = true; } }
                     return <td key={day} className={[draft ? styles.edited : "", day === today ? styles.todayCell : "", invalid ? styles.invalid : ""].join(" ")}><input aria-label={`${row.centre.name}, ${row.platform.name}, ${day}`} aria-invalid={invalid} title={invalid ? "Enter a non-negative whole subscriber count." : `${row.centre.name} · ${row.platform.name} · ${day}`} inputMode="numeric" autoComplete="off" value={value} readOnly={!data.canManage || saving} placeholder="—" onChange={(event) => updateDrafts([{ centre_id: row.centre.id, platform_id: row.platform.id, entry_date: day, text: event.target.value }])} onPaste={(event) => { if (data.canManage && !saving) pasteCells(event, rowIndex, dayIndex); }} onKeyDown={(event) => {
                        if (event.key === "Enter") { event.preventDefault(); const inputs = event.currentTarget.closest("tbody")?.querySelectorAll("input"); inputs?.[Math.min((rowIndex + 1) * days.length + dayIndex, rows.length * days.length - 1)]?.focus(); }
                     }} /></td>;
                  })}</tr>)}</tbody></table></div>{!rows.length && <p className={styles.loading}>No centres match your filter.</p>}<footer className={styles.sheetFooter}><span>{rows.length} rows · {days.length} days · Tab moves right, Enter moves down</span><span>Changes stay in this page across months until saved.</span></footer></div> :
                  <div className={styles.charts}><div className={styles.chartFilters}><div><h2>A clearer view of your growth</h2><p>Compare audiences, follow trends, and see who is gaining ground.</p></div><div className={styles.filters}><label className={styles.field}>Platform<select value={selectedPlatform?.id || ""} onChange={(event) => setPlatform(event.target.value)}>{data.platforms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={styles.field}>Daily snapshot<input type="date" min={days[0]} max={days[days.length - 1]} value={date} onChange={(event) => { if (days.includes(event.target.value)) setDate(event.target.value); }} /></label></div></div>{draftCount > 0 && <p className={styles.previewNote}>Preview includes unsaved entries. Save changes before sharing your charts.{invalidCount > 0 ? " Invalid cells are excluded from the preview." : ""}</p>}<MarketingCharts centres={data.centres} platforms={data.platforms} entries={effectiveEntries} platform={selectedPlatform} days={days} date={date} monthLabel={monthLabel} excluded={excludedCentres} onToggle={(id, checked) => setExcludedCentres((previous) => {
                     const next = new Set(previous);
                     if (checked) next.delete(id); else next.add(id);
                     return next;
                  })} /><p className={styles.chartHint}>The monthly audience growth chart uses each centre’s first and last recorded dates. Growth rate and the platform heatmap use the shared comparison dates. Missing counts stay unrecorded in every chart. JPG exports are rendered at 2× resolution.</p></div>}
            </section>}
      </>}
   </div>;
}
