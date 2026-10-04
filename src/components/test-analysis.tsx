"use client";
import { useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { performanceTests, sprintSegments, trialSummary } from "@/lib/tests-analysis";
import { heightFromCm } from "@/lib/analytics";
import type { HeightUnit, WorkoutSession } from "@/lib/types";
export default function TestAnalysis({ sessions, heightUnit }: { sessions: WorkoutSession[]; heightUnit: HeightUnit }) {
  const tests = performanceTests(sessions);
  const [key, setKey] = useState("");
  const test = tests.find(t => t.key === key) ?? tests[0];
  const [sessionId, setSessionId] = useState("");
  const available = test ? [...new Map(test.trials.map(t => [t.sessionId, t])).values()].reverse() : [];
  const selected = available.find(t => t.sessionId === sessionId) ?? available[0];
  const trials = test?.trials.filter(t => t.sessionId === selected?.sessionId) ?? [];
  const summary = trialSummary(trials.map(t => t.value), test?.kind === "sprint");
  const unit = test?.kind === "sprint" ? "s" : heightUnit;
  const display = (v: number | null) => v === null ? "-" : (test?.kind === "sprint" ? v : heightFromCm(v, heightUnit)).toFixed(test?.kind === "sprint" ? 3 : 1);
  const points = trials.map((t,i) => ({ attempt: i+1, value: test?.kind === "sprint" ? t.value : heightFromCm(t.value,heightUnit) }));
  return <section id="tests" className="panel scroll-mt-6"><div className="section-title"><div><span className="eyebrow">JUMP AND SPRINT ANALYSIS</span><h2>Performance tests</h2></div></div>
    <p className="account-description">Results stay separate by exercise, jump category, takeoff, leg, sprint distance, and exact protocol notes. Each row is one measured trial; reps do not multiply attempts. Legacy tests use standing, both-leg jumps and 10 m for the named fly sprint. Unrecorded protocols cannot establish comparable conditions.</p>
    {!test ? <p>Log a jump or sprint to see test results.</p> : <>
      <label className="field-label">Test and protocol<select value={test.key} onChange={e => { setKey(e.target.value); setSessionId(""); }}>{tests.map(t => <option key={t.key} value={t.key}>{t.name} / {t.variant} / {t.protocol}</option>)}</select></label>
      <p className="session-notes">Protocol: {test.protocol}</p>
      <dl className="history-stats"><div><dt>All-time best ({unit})</dt><dd>{display(test.best)}</dd></div><div><dt>All-time mean ({unit})</dt><dd>{display(test.average)}</dd></div><div><dt>Measured trials</dt><dd>{test.trials.length}</dd></div></dl>
      <label className="field-label">Session consistency<select value={selected?.sessionId ?? ""} onChange={e => setSessionId(e.target.value)}>{available.map(t => <option key={t.sessionId} value={t.sessionId}>{t.date} / {t.sessionTitle}</option>)}</select></label>
      <p className="account-description">Session best: {display(summary.best)} {unit} / mean: {display(summary.average)} {unit} / variation (CV): {summary.cvPercent === null ? "needs two attempts" : summary.cvPercent.toFixed(1) + "%"}. CV uses population standard deviation divided by mean; lower values indicate more consistent measurements.</p>
      <div style={{ height: 260 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={points}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="attempt"/><YAxis domain={["auto", "auto"]}/><Tooltip/><Line name={"Result (" + unit + ")"} dataKey="value" stroke="#38bdf8" connectNulls={false}/></LineChart></ResponsiveContainer></div>
      <div className="table-scroll"><table><caption>Session attempts and sprint segment speeds</caption><thead><tr><th>Attempt</th><th>Result ({unit})</th><th>Mean speed (m/s)</th><th>Segments</th><th>Protocol</th></tr></thead><tbody>{trials.map((t,i) => <tr key={t.set.id}><td>{i+1}</td><td>{display(t.value)}</td><td>{t.speedMps?.toFixed(2) ?? "-"}</td><td>{sprintSegments(t.set).map(p => p.fromM + "-" + p.toM + " m: " + p.seconds.toFixed(3) + " s, " + p.speedMps.toFixed(2) + " m/s").join("; ") || "-"}</td><td>{test.protocol}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
