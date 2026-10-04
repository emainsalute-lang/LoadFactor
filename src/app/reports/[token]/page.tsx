import { notFound } from "next/navigation";
import { CoachingStore } from "@/lib/server/coaching-store";
import { store, ServiceError } from "@/lib/server/store";
import type { ProgressReport } from "@/lib/coaching";
import PrintReportButton from "@/components/print-report-button";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "LoadFactor progress report", robots: { index: false, follow: false } };
export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; let report: ProgressReport;
  try { report = new CoachingStore(store()).report(token); } catch (error) { if (error instanceof ServiceError && error.status === 404) notFound(); throw error; }
  const format = (value: number | null) => value === null ? "Not recorded" : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return <main className="mx-auto max-w-5xl space-y-6 p-6"><div className="report-actions"><PrintReportButton/></div><article className="panel print-report"><span className="eyebrow">LOADFACTOR PROGRESS REPORT</span><h1>{report.title}</h1><h2>{report.athleteName}</h2><p>{report.from} to {report.to}</p><p className="account-description">Snapshot created {new Date(report.createdAt).toLocaleString()}. The owner can revoke access to this link.</p>
    <dl className="history-stats"><div><dt>Completed workouts</dt><dd>{report.totals.sessions}</dd></div><div><dt>Volume (kg x reps)</dt><dd>{format(report.totals.volumeKg)}</dd></div><div><dt>Recorded session load (AU)</dt><dd>{format(report.totals.sessionLoad)}</dd></div></dl><p className="account-description">Load recorded for {report.totals.loadSessions} of {report.totals.sessions} workouts. AU = duration in minutes x overall session RPE.</p>
    <h3>Strength</h3><div className="table-scroll"><table><thead><tr><th>Exercise</th><th>Best estimated 1RM (kg)</th><th>Volume (kg x reps)</th></tr></thead><tbody>{report.strength.map((exercise, i) => <tr key={i}><td>{exercise.name}</td><td>{format(exercise.estimateKg)}</td><td>{format(exercise.volumeKg)}</td></tr>)}</tbody></table></div><p className="account-description">Estimated maxima use working sets of 1-10 reps and an Epley-style estimate.</p>
    <h3>Jump and sprint results</h3><div className="table-scroll"><table><thead><tr><th>Test</th><th>Variant</th><th>Protocol group</th><th>Best</th><th>Average</th><th>Trials</th></tr></thead><tbody>{report.tests.map((test, i) => <tr key={i}><td>{test.name}</td><td>{test.variant}</td><td>{test.protocolGroup}</td><td>{format(test.best)} {test.unit}</td><td>{format(test.average)} {test.unit}</td><td>{test.trials}</td></tr>)}</tbody></table></div>
    <h3>Daily training</h3><div className="table-scroll"><table><thead><tr><th>Date</th><th>Workouts</th><th>Volume (kg x reps)</th><th>Session load (AU)</th></tr></thead><tbody>{report.dates.map(day => <tr key={day.date}><td>{day.date}</td><td>{day.sessions}</td><td>{format(day.volumeKg)}</td><td>{format(day.sessionLoad)}</td></tr>)}</tbody></table></div>
  </article></main>;
}
