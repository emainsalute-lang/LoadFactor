"use client";
import { useEffect, useState, type FormEvent } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { heightFromCm, weightFromKg, weightToKg } from "@/lib/analytics";
import { api } from "@/lib/client-api";
import { bodyweightHistory, wellnessComparison, wellnessHistorySchema, wellnessSchemaFor, type WellnessCheckIn } from "@/lib/wellness";
import { performanceTests } from "@/lib/tests-analysis";
import { strengthCatalog } from "@/lib/strength";
import { muscleGroups, type HeightUnit, type WeightUnit, type WorkoutSession } from "@/lib/types";

function blank(date: string): WellnessCheckIn {
  return { date, sleepHours: null, sleepQuality: null, soreness: null, stress: null, mood: null, bodyweightKg: null, muscleSoreness: {}, notes: "" };
}
const ratings = [
  { key: "sleepQuality", label: "Sleep quality", ends: "1 = very poor, 5 = excellent" },
  { key: "soreness", label: "Overall muscle soreness", ends: "1 = none, 5 = very high" },
  { key: "stress", label: "Stress", ends: "1 = very low, 5 = very high" },
  { key: "mood", label: "Mood", ends: "1 = very low, 5 = very good" },
] as const;
type ReportMetric = "sleepHours" | typeof ratings[number]["key"];
export default function WellnessDashboard({ checkIns, onCheckIns, sessions, today, accountId, weightUnit, heightUnit }: {
  checkIns: WellnessCheckIn[]; onCheckIns: (values: WellnessCheckIn[]) => void; sessions: WorkoutSession[];
  today: string; accountId?: string; weightUnit: WeightUnit; heightUnit: HeightUnit;
}) {
  const [form, setForm] = useState<WellnessCheckIn>(() => checkIns.find(c => c.date === today) ?? blank(today));
  const [ready, setReady] = useState(!!accountId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [days, setDays] = useState(30);
  const [reportMetric, setReportMetric] = useState<ReportMetric>("sleepHours");
  const [outcome, setOutcome] = useState("load");
  const [testKey, setTestKey] = useState("");
  const [exerciseId, setExerciseId] = useState("");
  const tests = performanceTests(sessions), test = tests.find(t => t.key === testKey) ?? tests[0];
  const strength = strengthCatalog(sessions), exercise = strength.find(e => e.id === exerciseId) ?? strength[0];
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!accountId) {
        try {
          const raw = localStorage.getItem("loadfactor-wellness-v1");
          if (raw) { const saved = wellnessHistorySchema.parse(JSON.parse(raw)); onCheckIns(saved); setForm(saved.find(c => c.date === today) ?? blank(today)); }
        } catch { setError("Saved wellness data could not be read. Export available data before changing check-ins."); }
      }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [accountId, onCheckIns, today]);
  function chooseDate(date: string) { setForm(checkIns.find(c => c.date === date) ?? blank(date)); setError(""); setNotice(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const parsed = wellnessSchemaFor(() => today).safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your wellness fields."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const next = wellnessHistorySchema.parse([...checkIns.filter(c => c.date !== form.date), parsed.data].sort((a, b) => a.date.localeCompare(b.date)));
      const result = accountId ? (await api<{ wellness: WellnessCheckIn[] }>("/api/account/wellness", "PUT", parsed.data)).wellness : next;
      if (!accountId) localStorage.setItem("loadfactor-wellness-v1", JSON.stringify(result));
      onCheckIns(result); setForm(parsed.data); setNotice("Daily check-in saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the check-in."); } finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try {
      const result = accountId ? (await api<{ wellness: WellnessCheckIn[] }>("/api/account/wellness", "DELETE", { date: form.date })).wellness : checkIns.filter(c => c.date !== form.date);
      if (!accountId) localStorage.setItem("loadfactor-wellness-v1", JSON.stringify(result));
      onCheckIns(result); setForm(blank(form.date)); setNotice("Check-in removed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove the check-in."); } finally { setBusy(false); }
  }
  const points = wellnessComparison(checkIns, sessions, today, days, test?.key, exercise?.id);
  const unit = outcome === "load" ? "AU" : outcome === "volume" || outcome === "e1rm" ? weightUnit : test?.kind === "sprint" ? "s" : heightUnit;
  const chart = points.map(p => ({ ...p, outcomeValue: outcome === "load" ? p.load : outcome === "volume" ? p.volumeKg === null ? null : weightFromKg(p.volumeKg, weightUnit) : outcome === "e1rm" ? p.estimateKg === null ? null : weightFromKg(p.estimateKg, weightUnit) : p.performance === null ? null : test?.kind === "sprint" ? p.performance : heightFromCm(p.performance, heightUnit) }));
  const reportName = reportMetric === "sleepHours" ? "Sleep duration (hours)" : ratings.find(r => r.key === reportMetric)!.label + " (1-5)";
  const weights = bodyweightHistory(checkIns, sessions).filter(p => p.date <= today).map(p => ({ ...p, value: weightFromKg(p.bodyweightKg, weightUnit) }));
  return <section id="wellness" className="panel scroll-mt-6"><div className="section-title"><div><span className="eyebrow">DAILY WELLNESS</span><h2>Wellness and session load</h2></div></div>
    {error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="success-message" role="status">{notice}</p>}
    <form onSubmit={e => void submit(e)}><fieldset disabled={busy || !ready}><div className="history-filters">
      <label className="field-label">Check-in date<input type="date" required max={today} value={form.date} onChange={e => chooseDate(e.target.value)}/></label>
      <label className="field-label">Sleep duration (hours)<input type="number" min="0" max="24" step="any" value={form.sleepHours ?? ""} onChange={e => setForm({ ...form, sleepHours: e.target.value === "" ? null : Number(e.target.value) })}/></label>
      {ratings.map(r => <label className="field-label" key={r.key}>{r.label}<select value={form[r.key] ?? ""} onChange={e => setForm({ ...form, [r.key]: e.target.value === "" ? null : Number(e.target.value) })}><option value="">Not recorded</option>{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}</select><span>{r.ends}</span></label>)}
      <label className="field-label">Measured bodyweight ({weightUnit})<input type="number" min="0.01" step="any" value={form.bodyweightKg === null ? "" : Number(weightFromKg(form.bodyweightKg, weightUnit).toFixed(2))} onChange={e => setForm({ ...form, bodyweightKg: e.target.value === "" ? null : weightToKg(Number(e.target.value), weightUnit) })}/></label>
    </div><details><summary>Soreness by muscle group</summary><p className="account-description">1 = none, 5 = very high. Leave unmeasured groups unrecorded.</p><div className="history-filters">{muscleGroups.map(group => <label className="field-label" key={group}>{group}<select value={form.muscleSoreness[group] ?? ""} onChange={e => { const values = { ...form.muscleSoreness }; if (!e.target.value) delete values[group]; else values[group] = Number(e.target.value); setForm({ ...form, muscleSoreness: values }); }}><option value="">Not recorded</option>{[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}</select></label>)}</div></details>
      <label className="field-label">Check-in notes<textarea rows={2} maxLength={1000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></label><div className="phase-controls"><button className="primary-button">{checkIns.some(c => c.date === form.date) ? "Update check-in" : "Save check-in"}</button>{checkIns.some(c => c.date === form.date) && <button type="button" className="text-button" onClick={() => void remove()}>Remove this check-in</button>}</div>
    </fieldset></form>
    <p className="account-description">One check-in per day. All measurements are optional. Daily bodyweight records stay separate from profile defaults and workout bodyweight snapshots.</p>
    <h3>Bodyweight history ({weightUnit})</h3><p className="account-description">Daily check-ins take priority; dates without a daily measurement use the latest recorded workout bodyweight that day.</p>
    {weights.length ? <><div style={{ height: 230 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={weights}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis domain={["auto", "auto"]}/><Tooltip/><Line name={"Bodyweight (" + weightUnit + ")"} dataKey="value" stroke="#b18700" connectNulls={false}/></LineChart></ResponsiveContainer></div><details><summary>Bodyweight measurements</summary><div className="table-scroll"><table><thead><tr><th>Date</th><th>Bodyweight ({weightUnit})</th><th>Source</th></tr></thead><tbody>{weights.map(p => <tr key={p.date}><td>{p.date}</td><td>{p.value.toFixed(1)}</td><td>{p.source}</td></tr>)}</tbody></table></div></details></> : <p>No measured bodyweight history yet.</p>}
    <h3>Wellness and training outcomes</h3><div className="history-filters"><label className="field-label">Date range<select value={days} onChange={e => setDays(Number(e.target.value))}>{[30, 90, 180, 365].map(d => <option key={d} value={d}>Last {d} days</option>)}</select></label><label className="field-label">Wellness report<select value={reportMetric} onChange={e => setReportMetric(e.target.value as ReportMetric)}><option value="sleepHours">Sleep duration</option>{ratings.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label><label className="field-label">Training outcome<select value={outcome} onChange={e => setOutcome(e.target.value)}><option value="load">Daily session load</option><option value="volume">Daily volume</option><option value="e1rm">Best estimated 1RM</option><option value="test">Best jump / sprint test</option></select></label>
      {outcome === "test" && <label className="field-label">Comparable test<select value={test?.key ?? ""} onChange={e => setTestKey(e.target.value)}>{tests.map(t => <option key={t.key} value={t.key}>{t.name} / {t.variant} / {t.protocol}</option>)}</select></label>}
      {outcome === "e1rm" && <label className="field-label">Strength exercise<select value={exercise?.id ?? ""} onChange={e => setExerciseId(e.target.value)}>{strength.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>}
    </div><p className="account-description">Same-date observations use separate scales. Timing and other factors may affect results. Session load is minutes x overall session RPE (AU); daily load totals include only workouts with both values recorded. Missing reports and outcomes remain gaps. Jump and sprint variants, distances and protocols stay separate.</p>
    <div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={chart}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis yAxisId="wellness" domain={reportMetric === "sleepHours" ? [0, 24] : [1, 5]}/><YAxis yAxisId="outcome" orientation="right" domain={["auto", "auto"]}/><Tooltip/><Legend/><Line yAxisId="wellness" name={reportName} dataKey={reportMetric} stroke="#b18700" connectNulls={false}/><Line yAxisId="outcome" name={"Training outcome (" + unit + ")"} dataKey="outcomeValue" stroke="#6c7280" connectNulls={false}/></LineChart></ResponsiveContainer></div>
    <div className="table-scroll"><table><caption>Daily wellness and training outcomes</caption><thead><tr><th>Date</th><th>{reportName}</th><th>Outcome ({unit})</th><th>Completed sessions</th><th>Sessions with recorded load</th></tr></thead><tbody>{chart.map(p => <tr key={p.date}><td>{p.date}</td><td>{p[reportMetric] ?? "Not recorded"}</td><td>{p.outcomeValue?.toFixed(2) ?? "Not recorded"}</td><td>{p.sessions}</td><td>{p.loadSessions} / {p.sessions}</td></tr>)}</tbody></table></div>
    <details><summary>Check-in history ({checkIns.length})</summary><div className="table-scroll"><table><thead><tr><th>Date</th><th>Sleep (h)</th><th>Quality</th><th>Soreness</th><th>Stress</th><th>Mood</th><th>Bodyweight ({weightUnit})</th><th>Muscle groups</th><th>Notes</th><th>Actions</th></tr></thead><tbody>{[...checkIns].sort((a, b) => b.date.localeCompare(a.date)).map(c => <tr key={c.date}><td>{c.date}</td><td>{c.sleepHours ?? "-"}</td><td>{c.sleepQuality ?? "-"}</td><td>{c.soreness ?? "-"}</td><td>{c.stress ?? "-"}</td><td>{c.mood ?? "-"}</td><td>{c.bodyweightKg === null ? "-" : weightFromKg(c.bodyweightKg, weightUnit).toFixed(1)}</td><td>{Object.entries(c.muscleSoreness).map(([group, value]) => group + ": " + value).join(", ") || "-"}</td><td>{c.notes}</td><td><button className="text-button" disabled={busy} type="button" onClick={() => chooseDate(c.date)}>Edit</button></td></tr>)}</tbody></table></div></details>
  </section>;
}
