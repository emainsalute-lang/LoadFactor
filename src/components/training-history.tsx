"use client";
import Link from "next/link";
import { ArrowRight, CalendarDays, Dumbbell, FileText } from "lucide-react";
import HistoryReport from "./history-report";
import { useFirebaseUser } from "./firebase-auth";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { filterHistory, emptyFilter, historyCatalog, historyFilterSchema, monthDays, savedFiltersSchema, sessionTotals, shiftMonth, type HistoryFilter, type SavedHistoryFilter } from "@/lib/history";
import { heightFromCm, parseDate, weightFromKg } from "@/lib/analytics";
import type { HeightUnit, WeightUnit, WorkoutSession } from "@/lib/types";
import SessionDetail from "./session-detail";
type Props = { sessions: WorkoutSession[]; today: string; weightUnit: WeightUnit; heightUnit: HeightUnit; accountId?: string; initialFilters: SavedHistoryFilter[]; ready: boolean; deleted: boolean; onUndo: () => void; onEdit: (s: WorkoutSession, mode: "edit" | "duplicate") => void; onDelete: (id: string) => void; onExport: () => void };
export default function TrainingHistory({ sessions, today, weightUnit, heightUnit, accountId, initialFilters, ready, deleted, onUndo, onEdit, onDelete, onExport }: Props) {
  const firebaseUser = useFirebaseUser();
  const filterStorageKey = "loadfactor-history-filters-v1" + (firebaseUser ? ":firebase:" + firebaseUser.uid : "");
  const [period, setPeriod] = useState<"all" | "month">("all");
  const [filter, setFilter] = useState<HistoryFilter>(emptyFilter), [month, setMonth] = useState(today.slice(0, 7)), [view, setView] = useState<"list" | "calendar">("list");
  const [selectedDay, setSelectedDay] = useState(""), [comparison, setComparison] = useState<string[]>([]);
  const [presets, setPresets] = useState(initialFilters), [presetName, setPresetName] = useState(""), [presetReady, setPresetReady] = useState(!!accountId);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (accountId) return;
    const frame = requestAnimationFrame(() => {
      try { const raw = localStorage.getItem(filterStorageKey); if (raw) setPresets(savedFiltersSchema.parse(JSON.parse(raw))); }
      catch { setError("Saved filters could not be read from this browser."); }
      setPresetReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [accountId, filterStorageKey]);
  function patch(values: Partial<HistoryFilter>) { setFilter(current => ({ ...current, ...values })); setSelectedDay(""); setNotice(""); }
  async function persist(next: SavedHistoryFilter[]) {
    setBusy(true); setError("");
    try {
      const parsed = savedFiltersSchema.parse(next);
      if (accountId) await api("/api/account/filters", "PUT", parsed); else localStorage.setItem(filterStorageKey, JSON.stringify(parsed));
      setPresets(parsed); setNotice("Saved filters updated.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save filters."); }
    finally { setBusy(false); }
  }
  function saveFilter() {
    const parsed = historyFilterSchema.safeParse(filter), name = presetName.trim();
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your filters."); return; }
    if (!name) { setError("Enter a name for this filter."); return; }
    if (presets.length >= 20) { setError("You can save up to 20 filters. Remove one first."); return; }
    if (presets.some(p => p.name.toLowerCase() === name.toLowerCase())) { setError("Choose a different filter name."); return; }
    void persist([...presets, { id: crypto.randomUUID(), name, filter: parsed.data }]); setPresetName("");
  }
  const parsedFilter = historyFilterSchema.safeParse(filter), matches = parsedFilter.success ? filterHistory(sessions, parsedFilter.data) : [];
  const inPeriod = period === "month" || view === "calendar" ? matches.filter(session => session.date.startsWith(month + "-")) : matches;
  const visible = selectedDay ? inPeriod.filter(s => s.date === selectedDay) : inPeriod;
  const catalog = historyCatalog(sessions), tags = [...new Set(sessions.flatMap(s => s.tags ?? []))].sort();
  const days = monthDays(month);
  const chosen = comparison.flatMap(id => { const session = sessions.find(s => s.id === id); return session ? [session] : []; });
  function toggleCompare(id: string) { setComparison(previous => { const current = previous.filter(value => sessions.some(s => s.id === value)); return current.includes(id) ? current.filter(v => v !== id) : current.length < 2 ? [...current, id] : current; }); }
  const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return <section id="history" className="panel history-panel scroll-mt-6">
    <div className="section-title"><div><span className="eyebrow">Your saved sessions</span><h2>Training history</h2><p className="account-description">Every workout you save appears here. Open a session to see its metrics, charts, and notes.</p></div><button className="text-button" onClick={onExport}>Export data</button></div>
    {deleted && <p className="success-message" role="status">Session deleted. <button className="text-button" onClick={onUndo}>Undo deletion</button></p>}
    <details className="history-search-options"><summary>Search and filter saved sessions</summary>
    <div className="history-filters">
      <label className="field-label">Search titles & notes<input type="search" value={filter.query} maxLength={200} placeholder="Find a session or note" onChange={e => patch({ query: e.target.value })}/></label>
      <label className="field-label">Exercise<select value={filter.exerciseId} onChange={e => patch({ exerciseId: e.target.value })}><option value="">All exercises</option>{catalog.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}{filter.exerciseId && !catalog.some(e => e.id === filter.exerciseId) && <option value={filter.exerciseId}>Unavailable exercise</option>}</select></label>
      <label className="field-label">Training category<select value={filter.category} onChange={e => patch({ category: e.target.value as HistoryFilter["category"] })}><option value="">All categories</option><option value="strength">Strength</option><option value="jump">Jump</option><option value="sprint">Sprint</option></select></label>
      <label className="field-label">From<input type="date" value={filter.from} onChange={e => patch({ from: e.target.value })}/></label><label className="field-label">Through<input type="date" value={filter.to} onChange={e => patch({ to: e.target.value })}/></label>
      <label className="field-label">Tag<select value={filter.tag} onChange={e => patch({ tag: e.target.value })}><option value="">All tags</option>{tags.map(tag => <option key={tag} value={tag}>{tag}</option>)}{filter.tag && !tags.includes(filter.tag) && <option value={filter.tag}>{filter.tag}</option>}</select></label>
    </div>
    <div className="phase-controls"><button className="secondary-button" onClick={() => { setFilter(emptyFilter); setSelectedDay(""); }}>Clear filters</button><label className="field-label">Saved filters<select value="" disabled={!presetReady || busy} onChange={e => { const preset = presets.find(p => p.id === e.target.value); if (preset) { setFilter(preset.filter); setSelectedDay(""); setNotice("Loaded " + preset.name); } }}><option value="">Choose a saved filter</option>{presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="field-label">Filter name<input value={presetName} maxLength={60} onChange={e => setPresetName(e.target.value)} placeholder="e.g. Preseason jumps"/></label><button disabled={!presetReady || busy} className="secondary-button" onClick={saveFilter}>Save current filters</button></div>
    <details><summary>Manage saved filters</summary>{presets.map(p => <div className="template-item" key={p.id}><span>{p.name}</span><button disabled={busy} className="text-button" onClick={() => void persist(presets.filter(v => v.id !== p.id))}>Remove {p.name}</button></div>)}{!presets.length && <p>No saved filters yet.</p>}</details>
    {!parsedFilter.success && <p role="alert" className="error-message">{parsedFilter.error.issues[0]?.message}</p>}{error && <p role="alert" className="error-message">{error}</p>}{notice && <p role="status" className="success-message">{notice}</p>}
    </details>
    <div className="history-toolbar"><label className="field-label">Report period<select value={period} onChange={event => { setPeriod(event.target.value as "all" | "month"); setView("list"); setSelectedDay(""); }}><option value="all">All saved sessions</option><option value="month">Selected month</option></select></label><div className="range-switch" role="group" aria-label="History view"><button aria-pressed={view === "list"} className={view === "list" ? "selected" : ""} onClick={() => { setView("list"); setSelectedDay(""); }}>Sessions</button><button aria-pressed={view === "calendar"} className={view === "calendar" ? "selected" : ""} onClick={() => setView("calendar")}>Calendar</button></div>{(period === "month" || view === "calendar") && <div className="month-navigation"><button className="secondary-button" aria-label="Previous month" onClick={() => { setMonth(shiftMonth(month, -1)); setSelectedDay(""); }}>Previous</button><label className="field-label">Training month<input type="month" value={month} min="1000-01" max="9999-12" onChange={e => { if (/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(e.target.value)) { setMonth(e.target.value); setSelectedDay(""); } }}/></label><button className="secondary-button" aria-label="Next month" onClick={() => { setMonth(shiftMonth(month, 1)); setSelectedDay(""); }}>Next</button></div>}</div>
    <HistoryReport sessions={visible} weightUnit={weightUnit} period={selectedDay ? "Sessions on " + selectedDay : period === "month" || view === "calendar" ? "Sessions in " + month : "All saved sessions"}/>
    {view === "calendar" && <><div className="training-calendar" aria-label={"Training calendar for " + month}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <span className="calendar-weekday" key={day}>{day}</span>)}{days.map((day, index) => {
      if (!day) return <span className="calendar-blank" key={"blank-" + index}/>;
      const daySessions = matches.filter(s => s.date === day);
      return <button key={day} className={"calendar-day " + (selectedDay === day ? "selected" : "")} aria-pressed={selectedDay === day} aria-current={day === today ? "date" : undefined} aria-label={day + ": " + daySessions.length + " matching sessions"} onClick={() => setSelectedDay(selectedDay === day ? "" : day)}><strong>{Number(day.slice(-2))}</strong><span>{daySessions.length ? daySessions.length + " sessions" : ""}</span></button>;
    })}</div>{!selectedDay && <p className="account-description">Choose a day to see its sessions.</p>}</>}
    <div className="history-toolbar"><p className="account-description" role="status">{visible.length} matching sessions{selectedDay ? " on " + selectedDay : ""}</p>{selectedDay && <button className="text-button" onClick={() => setSelectedDay("")}>Show all matching sessions</button>}<p className="account-description">Select up to two sessions to compare. {chosen.length}/2 selected.</p><button className="text-button" onClick={() => setComparison([])}>Clear comparison</button></div>
    {!ready ? <p className="account-description" role="status">Loading saved sessions...</p> : <div className="saved-session-grid">{visible.map(session => {
      const totals = sessionTotals(session), exercises = historyCatalog([session]).filter(exercise => session.exercises.some(set => set.exerciseId === exercise.id));
      const href = "/sessions/" + encodeURIComponent(session.id) + "?weight=" + weightUnit + "&height=" + heightUnit;
      return <article className="saved-session-card" key={session.id}>
        <Link className="saved-session-open" href={href} aria-label={"Open " + session.title + " from " + session.date}>
          <div className="saved-session-date"><CalendarDays size={15}/>{parseDate(session.date).toLocaleDateString("en-US", { dateStyle: "medium" })}<ArrowRight size={18}/></div>
          <h3>{session.title}</h3><p className="saved-session-exercises"><Dumbbell size={16}/>{exercises.map(exercise => exercise.name).join(", ")}</p>
          <dl className="saved-session-stats"><div><dt>Sets</dt><dd>{totals.sets}</dd></div><div><dt>Volume ({weightUnit})</dt><dd>{format(weightFromKg(totals.volumeKg, weightUnit))}</dd></div><div><dt>Effort / 10</dt><dd>{totals.averageRpe?.toFixed(1) ?? "Not recorded"}</dd></div></dl>
          {session.notes && <p className="saved-session-note">{session.notes}</p>}
          <span className="saved-session-view"><FileText size={15}/>View workout results</span>
        </Link>
        {(session.tags ?? []).length > 0 && <div className="tag-list">{session.tags!.map(tag => <span className="session-tag" key={tag}>{tag}</span>)}</div>}
        <div className="saved-session-actions"><label><input className="comparison-checkbox" type="checkbox" aria-label={"Compare " + session.title + " on " + session.date} checked={comparison.includes(session.id)} disabled={!comparison.includes(session.id) && chosen.length >= 2} onChange={() => toggleCompare(session.id)}/>Compare</label><button className="text-button" onClick={() => onEdit(session, "edit")}>Edit</button><button className="text-button" onClick={() => onEdit(session, "duplicate")}>Duplicate</button><button className="text-button" onClick={() => onDelete(session.id)}>Delete</button></div>
      </article>;
    })}</div>}
    {ready && !visible.length && <div className="history-empty"><FileText size={28}/><h3>{sessions.length ? "No sessions match this view" : "No saved sessions yet"}</h3><p>{sessions.length ? "Choose all saved sessions or clear your filters to find your workouts." : "Save your first workout in Log workout. Its results will appear here."}</p><Link className="primary-button" href="/logger">Log a workout</Link>{sessions.length > 0 && <button type="button" className="secondary-button" onClick={() => { setFilter(emptyFilter); setPeriod("all"); setView("list"); setSelectedDay(""); }}>Show all saved sessions</button>}</div>}
    {chosen.length === 2 && <section className="session-comparison" aria-label="Session comparison"><h3>Side-by-side comparison</h3><p className="account-description">Changes show the second selected session minus the first. RPE is self-reported exertion.</p><div className="table-scroll"><table><thead><tr><th>Metric</th><th>{chosen[0].title}</th><th>{chosen[1].title}</th><th>Change</th></tr></thead><tbody>{(() => {
      const a = sessionTotals(chosen[0]), b = sessionTotals(chosen[1]);
      const rows: { label: string; a: number | null; b: number | null }[] = [{ label: "Sets", a: a.sets, b: b.sets }, { label: "Total reps", a: a.reps, b: b.reps }, { label: "Volume (" + weightUnit + ")", a: weightFromKg(a.volumeKg, weightUnit), b: weightFromKg(b.volumeKg, weightUnit) }, { label: "Mean set RPE", a: a.averageRpe, b: b.averageRpe }, { label: "Best vertical jump (" + heightUnit + ")", a: a.jumpCm === null ? null : heightFromCm(a.jumpCm, heightUnit), b: b.jumpCm === null ? null : heightFromCm(b.jumpCm, heightUnit) }, { label: "Best 10m fly (sec)", a: a.sprintSeconds, b: b.sprintSeconds }];
      return rows.map(row => <tr key={row.label}><td>{row.label}</td><td>{row.a === null ? "-" : format(row.a)}</td><td>{row.b === null ? "-" : format(row.b)}</td><td>{row.a === null || row.b === null ? "-" : (row.b - row.a > 0 ? "+" : "") + (row.b - row.a).toFixed(2)}</td></tr>);
    })()}</tbody></table></div><div className="comparison-columns">{chosen.map(session => <SessionDetail key={session.id} session={session} weightUnit={weightUnit} heightUnit={heightUnit} feedbackEnabled={!!accountId}/>)}</div></section>}
  </section>;
}
