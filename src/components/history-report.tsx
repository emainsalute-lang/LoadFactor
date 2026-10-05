"use client";

import { useRef } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Printer } from "lucide-react";
import { historySummary, sessionTotals } from "@/lib/history";
import { parseDate, weightFromKg } from "@/lib/analytics";
import type { WeightUnit, WorkoutSession } from "@/lib/types";

export default function HistoryReport({ sessions, weightUnit, period }: { sessions: WorkoutSession[]; weightUnit: WeightUnit; period: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = historySummary(sessions);
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const points = ordered.map((session, index) => ({ label: String(index + 1), title: session.title, date: session.date, value: weightFromKg(sessionTotals(session).volumeKg, weightUnit) }));
  const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return <section className="history-report print-report" aria-labelledby="history-report-heading">
    <div className="section-title"><div><h3 id="history-report-heading">Training summary</h3><p className="account-description">{period}. This report uses the sessions shown below, including your search filters.</p></div><button type="button" className="secondary-button report-actions" disabled={!sessions.length} onClick={() => { if (details.current) details.current.open = true; window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print())); }}><Printer size={16}/>Print / PDF report</button></div>
    <dl className="results-metrics"><div><dt>Saved sessions</dt><dd>{summary.sessions}</dd></div><div><dt>Training days</dt><dd>{summary.trainingDays}</dd></div><div><dt>Sets / attempts</dt><dd>{summary.sets}</dd></div><div><dt>Total volume</dt><dd>{format(weightFromKg(summary.volumeKg, weightUnit))}<small> {weightUnit}</small></dd></div><div><dt>Average set effort</dt><dd>{summary.averageRpe?.toFixed(1) ?? "—"}<small> / 10</small></dd></div></dl>
    {sessions.length > 0 && <details ref={details} className="history-report-details"><summary>View report chart and session breakdown</summary><p className="account-description">Volume is recorded weight × reps. Jump and sprint results are available when you open each session. The numbers on the chart match the sessions in the table.</p><div className="history-report-chart" role="img" aria-label={`Recorded volume for ${points.length} sessions. Values are listed in the table below.`}><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={points} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}><CartesianGrid stroke="#e6e5dc" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="label" tick={{ fill: "#606875", fontSize: 12 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: "#606875", fontSize: 12 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "#fff", border: "1px solid #deded5", borderRadius: 8 }} labelFormatter={(_, payload) => { const point = payload?.[0]?.payload; return point ? `${point.date} · ${point.title}` : "Session"; }} formatter={value => [format(Number(value)) + " " + weightUnit, "Volume"]}/><Bar dataKey="value" fill="#c99b0b" radius={[5, 5, 0, 0]} maxBarSize={42}/></BarChart></ResponsiveContainer></div><div className="table-scroll"><table><caption className="sr-only">Sessions included in this training report</caption><thead><tr><th>#</th><th>Session</th><th>Date</th><th>Sets</th><th>Volume ({weightUnit})</th><th>Effort / 10</th></tr></thead><tbody>{ordered.map((session, index) => { const totals = sessionTotals(session); return <tr key={session.id}><td>{index + 1}</td><td>{session.title}</td><td>{parseDate(session.date).toLocaleDateString("en-US", { dateStyle: "medium" })}</td><td>{totals.sets}</td><td>{format(weightFromKg(totals.volumeKg, weightUnit))}</td><td>{totals.averageRpe?.toFixed(1) ?? "—"}</td></tr>; })}</tbody></table></div></details>}
  </section>;
}
