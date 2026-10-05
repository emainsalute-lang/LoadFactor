"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { filterHistory, emptyFilter, historyCatalog, historyFilterSchema, monthDays, monthlySummary, savedFiltersSchema, sessionTotals, shiftMonth, type HistoryFilter, type SavedHistoryFilter } from "@/lib/history";
import { heightFromCm, weightFromKg } from "@/lib/analytics";
import type { HeightUnit, WeightUnit, WorkoutSession } from "@/lib/types";
import SessionDetail from "./session-detail";
type Props = { sessions: WorkoutSession[]; today: string; weightUnit: WeightUnit; heightUnit: HeightUnit; accountId?: string; initialFilters: SavedHistoryFilter[]; ready: boolean; deleted: boolean; onUndo: () => void; onEdit: (s: WorkoutSession, mode: "edit" | "duplicate") => void; onDelete: (id: string) => void; onExport: () => void };
export default function TrainingHistory({ sessions, today, weightUnit, heightUnit, accountId, initialFilters, ready, deleted, onUndo, onEdit, onDelete, onExport }: Props) {
  const [filter, setFilter] = useState<HistoryFilter>(emptyFilter), [month, setMonth] = useState(today.slice(0, 7)), [view, setView] = useState<"list" | "calendar">("list");
  const [selectedDay, setSelectedDay] = useState(""), [comparison, setComparison] = useState<string[]>([]);
  const [presets, setPresets] = useState(initialFilters), [presetName, setPresetName] = useState(""), [presetReady, setPresetReady] = useState(!!accountId);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (accountId) return;
    const frame = requestAnimationFrame(() => {
      try { const raw = localStorage.getItem("loadfactor-history-filters-v1"); if (raw) setPresets(savedFiltersSchema.parse(JSON.parse(raw))); }
      catch { setError("Saved filters could not be read from this browser."); }
      setPresetReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [accountId]);
  function patch(values: Partial<HistoryFilter>) { setFilter(current => ({ ...current, ...values })); setSelectedDay(""); setNotice(""); }
  async function persist(next: SavedHistoryFilter[]) {
    setBusy(true); setError("");
    try {
      const parsed = savedFiltersSchema.parse(next);
      if (accountId) await api("/api/account/filters", "PUT", parsed); else localStorage.setItem("loadfactor-history-filters-v1", JSON.stringify(parsed));
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
  const visible = selectedDay ? matches.filter(s => s.date === selectedDay) : matches;
  const catalog = historyCatalog(sessions), tags = [...new Set(sessions.flatMap(s => s.tags ?? []))].sort();
  const summary = monthlySummary(sessions, month), days = monthDays(month);
  const chosen = comparison.flatMap(id => { const session = sessions.find(s => s.id === id); return session ? [session] : []; });
  function toggleCompare(id: string) { setComparison(previous => { const current = previous.filter(value => sessions.some(s => s.id === value)); return current.includes(id) ? current.filter(v => v !== id) : current.length < 2 ? [...current, id] : current; }); }
  const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return <section id="history" className="panel history-panel scroll-mt-6">
    <div className="section-title"><div><span className="eyebrow">Past workouts</span><h2>Training history</h2></div><button className="text-button" onClick={onExport}>Export data</button></div>
    {deleted && <p className="success-message" role="status">Session deleted. <button className="text-button" onClick={onUndo}>Undo deletion</button></p>}
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
    <div className="history-toolbar"><div className="range-switch" role="group" aria-label="History view"><button aria-pressed={view === "list"} className={view === "list" ? "selected" : ""} onClick={() => { setView("list"); setSelectedDay(""); }}>List</button><button aria-pressed={view === "calendar"} className={view === "calendar" ? "selected" : ""} onClick={() => setView("calendar")}>Calendar</button></div><div className="month-navigation"><button className="secondary-button" aria-label="Previous month" onClick={() => { setMonth(shiftMonth(month, -1)); setSelectedDay(""); }}>Previous</button><label className="field-label">Training month<input type="month" value={month} min="1000-01" max="9999-12" onChange={e => { if (/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(e.target.value)) { setMonth(e.target.value); setSelectedDay(""); } }}/></label><button className="secondary-button" aria-label="Next month" onClick={() => { setMonth(shiftMonth(month, 1)); setSelectedDay(""); }}>Next</button></div></div>
    <h3>Monthly summary</h3><p className="account-description">All sessions in {month}; search filters apply to the calendar and list below.</p><dl className="history-stats"><div><dt>Sessions</dt><dd>{summary.sessions}</dd></div><div><dt>Training days</dt><dd>{summary.trainingDays}</dd></div><div><dt>Sets</dt><dd>{summary.sets}</dd></div><div><dt>Volume ({weightUnit})</dt><dd>{format(weightFromKg(summary.volumeKg, weightUnit))}</dd></div><div><dt>Mean set RPE</dt><dd>{summary.averageRpe?.toFixed(1) ?? "-"}</dd></div></dl>
    {view === "calendar" && <><div className="training-calendar" aria-label={"Training calendar for " + month}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <span className="calendar-weekday" key={day}>{day}</span>)}{days.map((day, index) => {
      if (!day) return <span className="calendar-blank" key={"blank-" + index}/>;
      const daySessions = matches.filter(s => s.date === day);
      return <button key={day} className={"calendar-day " + (selectedDay === day ? "selected" : "")} aria-pressed={selectedDay === day} aria-current={day === today ? "date" : undefined} aria-label={day + ": " + daySessions.length + " matching sessions"} onClick={() => setSelectedDay(selectedDay === day ? "" : day)}><strong>{Number(day.slice(-2))}</strong><span>{daySessions.length ? daySessions.length + " sessions" : ""}</span></button>;
    })}</div>{!selectedDay && <p className="account-description">Choose a day to see its sessions.</p>}</>}
    <div className="history-toolbar"><p className="account-description" role="status">{visible.length} matching sessions{selectedDay ? " on " + selectedDay : ""}</p>{selectedDay && <button className="text-button" onClick={() => setSelectedDay("")}>Show all matching sessions</button>}<p className="account-description">Select up to two sessions to compare. {chosen.length}/2 selected.</p><button className="text-button" onClick={() => setComparison([])}>Clear comparison</button></div>
    <div className="table-scroll"><table><thead><tr><th>Compare</th><th>Session</th><th>Date</th><th>Tags</th><th>Sets</th><th>Volume ({weightUnit})</th><th>Mean set RPE</th><th>Actions</th></tr></thead><tbody>{visible.map(session => <tr key={session.id}><td><input className="comparison-checkbox" type="checkbox" aria-label={"Compare " + session.title + " on " + session.date} checked={comparison.includes(session.id)} disabled={!comparison.includes(session.id) && chosen.length >= 2} onChange={() => toggleCompare(session.id)}/></td><td><Link className="text-button" href={"/sessions/" + encodeURIComponent(session.id) + "?weight=" + weightUnit + "&height=" + heightUnit}>{session.title}</Link></td><td>{session.date}</td><td>{(session.tags ?? []).join(", ") || "-"}</td><td>{session.exercises.length}</td><td>{format(weightFromKg(session.volumeKg, weightUnit))}</td><td>{session.averageRpe.toFixed(1)}</td><td><div className="flex gap-3"><button disabled={!ready} className="text-button" onClick={() => onEdit(session, "edit")}>Edit</button><button disabled={!ready} className="text-button" onClick={() => onEdit(session, "duplicate")}>Duplicate</button><button disabled={!ready} className="text-button" onClick={() => onDelete(session.id)}>Delete</button></div></td></tr>)}{!visible.length && <tr><td colSpan={8}>No sessions match these filters{selectedDay ? " on this day" : ""}. Clear filters or log a session.</td></tr>}</tbody></table></div>
    {chosen.length === 2 && <section className="session-comparison" aria-label="Session comparison"><h3>Side-by-side comparison</h3><p className="account-description">Changes show the second selected session minus the first. RPE is self-reported exertion.</p><div className="table-scroll"><table><thead><tr><th>Metric</th><th>{chosen[0].title}</th><th>{chosen[1].title}</th><th>Change</th></tr></thead><tbody>{(() => {
      const a = sessionTotals(chosen[0]), b = sessionTotals(chosen[1]);
      const rows: { label: string; a: number | null; b: number | null }[] = [{ label: "Sets", a: a.sets, b: b.sets }, { label: "Total reps", a: a.reps, b: b.reps }, { label: "Volume (" + weightUnit + ")", a: weightFromKg(a.volumeKg, weightUnit), b: weightFromKg(b.volumeKg, weightUnit) }, { label: "Mean set RPE", a: a.averageRpe, b: b.averageRpe }, { label: "Best vertical jump (" + heightUnit + ")", a: a.jumpCm === null ? null : heightFromCm(a.jumpCm, heightUnit), b: b.jumpCm === null ? null : heightFromCm(b.jumpCm, heightUnit) }, { label: "Best 10m fly (sec)", a: a.sprintSeconds, b: b.sprintSeconds }];
      return rows.map(row => <tr key={row.label}><td>{row.label}</td><td>{row.a === null ? "-" : format(row.a)}</td><td>{row.b === null ? "-" : format(row.b)}</td><td>{row.a === null || row.b === null ? "-" : (row.b - row.a > 0 ? "+" : "") + (row.b - row.a).toFixed(2)}</td></tr>);
    })()}</tbody></table></div><div className="comparison-columns">{chosen.map(session => <SessionDetail key={session.id} session={session} weightUnit={weightUnit} heightUnit={heightUnit}/>)}</div></section>}
  </section>;
}
