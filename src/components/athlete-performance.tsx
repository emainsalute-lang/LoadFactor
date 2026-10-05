"use client";
import Link from "next/link";
import Image from "next/image";
import { useState, type FormEvent, type ReactNode } from "react";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { athleteProfileSchema, blankProfile, readiness, readinessSchema, sports, testDefinitions, testProgress, testRecordSchema, trainingLoadReport, workoutTestRecords, type AthleteProfile, type TestRecord } from "@/lib/athlete-performance";
import type { AthleteData } from "./athlete-data";
import { useFirebaseUser } from "./firebase-auth";
import { performanceTests } from "@/lib/tests-analysis";
import type { WorkoutSession } from "@/lib/types";
import type { Planning } from "@/lib/planning";

function Feedback({ error, notice }: { error: string; notice: string }) { return <>{error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="success-message" role="status">{notice}</p>}</>; }
function Chart({ points, unit }: { points: { date: string; value: number | null }[]; unit: string }) {
  if (!points.some(p => p.value !== null)) return <p>No measured results yet.</p>;
  return <div className="athlete-chart" role="img" aria-label={`${unit} trend; values also listed in the report below`}><ResponsiveContainer width="100%" height="100%"><LineChart data={points}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date" tick={{ fontSize: 11 }}/><YAxis width={55}/><Tooltip formatter={value => [`${value} ${unit}`, "Result"]}/><Line dataKey="value" stroke="#b88d00" strokeWidth={3} dot isAnimationActive={false} connectNulls={false}/></LineChart></ResponsiveContainer></div>;
}
function Stat({ title, children }: { title: string; children: ReactNode }) { return <div className="athlete-stat"><span>{title}</span><strong>{children}</strong></div>; }

export function AthleteProfileEditor({ data }: { data: AthleteData }) {
  const user = useFirebaseUser();
  const [draft, setDraft] = useState<AthleteProfile | null>(null);
  const form = draft ?? data.profile ?? { ...blankProfile, fullName: user?.displayName ?? "" };
  const now = new Date(), birthday = form.birthDate ? new Date(form.birthDate + "T12:00:00") : null;
  const age = birthday ? now.getFullYear() - birthday.getFullYear() - (now.getMonth() < birthday.getMonth() || now.getMonth() === birthday.getMonth() && now.getDate() < birthday.getDate() ? 1 : 0) : null;
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  function change<K extends keyof AthleteProfile>(key: K, value: AthleteProfile[K]) { setDraft({ ...form, [key]: value }); }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setNotice(""); const parsed = athleteProfileSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true); try { await data.saveProfile(parsed.data); setDraft(null); setNotice("Athlete profile saved."); } catch { setError("Profile could not be saved to Firebase. Your edits are still here."); } finally { setBusy(false); }
  }
  return <section className="panel athlete-panel"><h2>Athlete profile</h2><p>Your sport and goals personalize your training overview.</p>{data.profile?.photoUrl && <Image src={data.profile.photoUrl} alt={`${data.profile.fullName}'s profile photo`} width={80} height={80} unoptimized style={{ borderRadius: "50%", objectFit: "cover" }}/>}<Feedback error={error} notice={notice}/><form onSubmit={submit}><fieldset disabled={busy || !data.loaded.profile}><div className="history-filters">
    {(["fullName", "position", "team", "primaryGoal", "secondaryGoals", "photoUrl"] as const).map(key => <label className="field-label" key={key}>{{ fullName: "Full name", position: "Position", team: "Team", primaryGoal: "Primary goal", secondaryGoals: "Secondary goals", photoUrl: "Profile photo URL (HTTPS)" }[key]}<input required={key === "fullName"} type={key === "photoUrl" ? "url" : "text"} maxLength={key === "photoUrl" ? 2000 : 300} value={form[key]} onChange={e => change(key, e.target.value)}/></label>)}
    <label className="field-label">Sport<select value={form.sport} onChange={e => change("sport", e.target.value as AthleteProfile["sport"])}>{sports.map(s => <option key={s}>{s}</option>)}</select></label>
    <label className="field-label">Date of birth<input type="date" max={new Date().toISOString().slice(0,10)} value={form.birthDate} onChange={e => change("birthDate", e.target.value)}/>{age !== null && age >= 0 && <span>{age} years old</span>}</label>
    {(["heightCm", "weightKg", "classYear"] as const).map(key => <label className="field-label" key={key}>{{ heightCm: "Height (cm)", weightKg: "Weight (kg)", classYear: "Graduation / class year" }[key]}<input type="number" step={key === "classYear" ? "1" : "any"} value={form[key] ?? ""} onChange={e => change(key, e.target.value === "" ? null : Number(e.target.value))}/></label>)}
    <label className="field-label">Experience<select value={form.experience} onChange={e => change("experience", e.target.value as AthleteProfile["experience"])}>{["Beginner", "Intermediate", "Advanced"].map(v => <option key={v}>{v}</option>)}</select></label>
  </div><button className="primary-button">{busy ? "Saving..." : "Save athlete profile"}</button></fieldset></form></section>;
}

export function PerformanceTesting({ data, today, recordsOnly = false, sessions }: { data: AthleteData; today: string; recordsOnly?: boolean; sessions: WorkoutSession[] }) {
  const user = useFirebaseUser();
  const [name, setName] = useState("Vertical Jump"), [customName, setCustomName] = useState("");
  const definition = testDefinitions.find(d => d[0] === name);
  const [unit, setUnit] = useState<TestRecord["unit"]>("points"), [direction, setDirection] = useState<TestRecord["direction"]>("higher");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const groups = testProgress([...data.tests, ...workoutTestRecords(sessions, user?.uid ?? "")].filter(t => t.date <= today)), workoutTests = performanceTests(sessions);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!user) return; const form = e.currentTarget, fields = new FormData(form), now = new Date().toISOString();
    const parsed = testRecordSchema.safeParse({ id: crypto.randomUUID(), userId: user.uid, name: definition ? name : customName,
      result: Number(fields.get("result")), unit: definition?.[1] ?? unit, direction: definition?.[2] ?? direction,
      date: fields.get("date"), notes: fields.get("notes"), protocol: fields.get("protocol"), createdAt: now, updatedAt: now });
    setError(""); setNotice("");
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (parsed.data.date > today) { setError("Choose today or a past test date."); return; }
    setBusy(true); try { await data.saveTest(parsed.data); form.reset(); setNotice("Performance test saved. Records and trends are updated."); } catch { setError("Test could not be saved. Your entries are still here."); } finally { setBusy(false); }
  }
  async function remove(id: string) { setBusy(true); setError(""); try { await data.deleteTest(id); setNotice("Test deleted. Personal records were recalculated."); } catch { setError("Could not delete the test."); } finally { setBusy(false); } }
  return <><Feedback error={error} notice={notice}/>{!data.loaded.tests && !data.error && <p role="status">Loading performance tests...</p>}
    {!recordsOnly && <section className="panel athlete-panel"><h2>Record a performance test</h2><p>Keep the same protocol for comparable results. Strength tests record the measured load in kg; describe reps and technique in the protocol.</p><form onSubmit={submit}><fieldset disabled={busy || !data.loaded.tests}><div className="history-filters">
      <label className="field-label">Test<select value={name} onChange={e => setName(e.target.value)}>{testDefinitions.map(d => <option key={d[0]}>{d[0]}</option>)}<option>Custom test</option></select></label>
      {!definition && <><label className="field-label">Custom test name<input required maxLength={300} value={customName} onChange={e => setCustomName(e.target.value)}/></label><label className="field-label">Unit<select value={unit} onChange={e => setUnit(e.target.value as TestRecord["unit"])}>{["points", "seconds", "reps", "cm", "inches", "kg", "lbs", "level"].map(v => <option key={v}>{v}</option>)}</select></label><label className="field-label">Better result<select value={direction} onChange={e => setDirection(e.target.value as TestRecord["direction"])}><option value="higher">Higher</option><option value="lower">Lower</option><option value="neutral">Track only (no PR)</option></select></label></>}
      <label className="field-label">Result ({definition?.[1] ?? unit})<input required name="result" type="number" min="0.001" max="100000" step={definition?.[1] === "reps" || unit === "reps" && !definition ? "1" : "any"}/></label>
      <label className="field-label">Date<input required name="date" type="date" max={today} defaultValue={today}/></label>
      <label className="field-label">Protocol / conditions<input name="protocol" maxLength={300} placeholder="e.g. standing, no approach, same surface"/></label>
      <label className="field-label">Notes<textarea name="notes" maxLength={1000}/></label>
    </div><button className="primary-button">{busy ? "Saving..." : "Save test"}</button></fieldset></form></section>}
    {data.loaded.tests && !groups.length && <section className="panel athlete-panel"><h2>No performance tests yet</h2><p>Record a measured test to start your baseline. A later result can establish a new personal record.</p>{recordsOnly && <Link className="primary-button" href="/performance/testing">Record a test</Link>}</section>}
    {groups.map(g => <section className="panel athlete-panel" key={g.key}><h2>{g.latest.name}</h2><p>{g.latest.protocol || "No protocol specified"} · {g.latest.unit}</p><div className="athlete-stats"><Stat title="Latest">{g.latest.result} {g.latest.unit}</Stat><Stat title="All-time best">{g.best ? `${g.best.result} ${g.best.unit}` : "Tracking only"}</Stat><Stat title="Change from previous">{g.difference === null ? "Baseline" : `${g.difference > 0 ? "+" : ""}${g.difference.toFixed(2)} ${g.latest.unit}`}</Stat><Stat title="Improvement from baseline">{g.improvementPercent === null ? "Not enough comparable data" : `${g.improvementPercent.toFixed(1)}%`}</Stat></div>
      {recordsOnly ? <>{!g.prs.length && <p>No new PR yet. Your first result is the baseline.</p>}{g.prs.slice().reverse().map(pr => <div className="athlete-record" key={pr.record.id}><strong>New PR: {pr.record.result} {pr.record.unit}</strong><span>{pr.record.date} · Previous: {pr.previous.result} · Improvement: {pr.improvement.toFixed(2)} {pr.record.unit}</span></div>)}</> : <><Chart points={g.results.map(r => ({ date: r.date, value: r.result }))} unit={g.latest.unit}/><div className="overflow-x-auto"><table className="history-table"><thead><tr><th>Date</th><th>Result</th><th>Notes</th><th>Action</th></tr></thead><tbody>{g.results.slice().reverse().map(r => <tr key={r.id}><td>{r.date}</td><td>{r.result} {r.unit}</td><td>{r.notes || "None"}</td><td><>{r.id.startsWith("workout:") ? <Link href={`/sessions/${r.id.split(":")[1]}`}>Open workout</Link> : <button disabled={busy} className="text-button" onClick={() => void remove(r.id)}>Delete</button>}</></td></tr>)}</tbody></table></div></>}
    </section>)}
    {!!workoutTests.length && <section className="panel athlete-panel"><h2>Tests recorded in workouts</h2><p>Your existing jump and sprint attempts remain available with their protocols.</p>{workoutTests.map(t => <p key={t.key}><strong>{t.name}</strong>: best {t.best?.toFixed(2)} {t.kind === "sprint" ? "seconds" : "cm"} · {t.trials.length} attempts</p>)}<Link href="/tests">Open workout test charts</Link></section>}
  </>;
}

export function RecoveryCheckIn({ data, today }: { data: AthleteData; today: string }) {
  const [date, setDate] = useState(today), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Partial<import("@/lib/athlete-performance").ReadinessCheckIn> | null>(null);
  const selected = data.checkIns.find(c => c.date === date), result = selected ? readiness(selected) : null;
  const form = draft ?? selected ?? {};
  function chooseDate(value: string) { setDate(value); setDraft(null); setError(""); setNotice(""); }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fields = new FormData(e.currentTarget);
    const parsed = readinessSchema.safeParse({ ...Object.fromEntries(["sleepHours", "sleepQuality", "energy", "soreness", "stress", "motivation"].map(k => [k, Number(fields.get(k))])), date });
    setError(""); setNotice(""); if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (date > today) { setError("A check-in cannot be in the future."); return; }
    setBusy(true); try { await data.saveCheckIn(parsed.data); setDraft(null); setNotice("Readiness check-in saved."); } catch { setError("Could not save the check-in. Your entries are still here."); } finally { setBusy(false); }
  }
  async function remove() { setBusy(true); setError(""); try { await data.deleteCheckIn(date); setNotice("Check-in removed."); } catch { setError("Could not remove the check-in."); } finally { setBusy(false); } }
  const history = data.checkIns.filter(c => c.date <= today).sort((a,b) => a.date.localeCompare(b.date));
  return <><section className="panel athlete-panel"><h2>Daily readiness</h2><p>A training reflection based on your own check-in. This score is not medical advice.</p><Feedback error={error} notice={notice}/><label className="field-label">Check-in date<input type="date" required max={today} value={date} onChange={e => chooseDate(e.target.value)}/></label>
    <form key={date} onSubmit={submit}><fieldset disabled={busy || !data.loaded.readiness}><div className="history-filters"><label className="field-label">Sleep hours<input required type="number" name="sleepHours" min="0" max="24" step="0.1" value={form.sleepHours ?? ""} onChange={e => setDraft({ ...form, sleepHours: e.target.value === "" ? undefined : Number(e.target.value) })}/></label>{(["sleepQuality", "energy", "soreness", "stress", "motivation"] as const).map(k => <label className="field-label" key={k}>{{ sleepQuality: "Sleep quality", energy: "Energy", soreness: "Muscle soreness", stress: "Stress", motivation: "Motivation" }[k]} (1–10)<input required type="number" name={k} min="1" max="10" step="1" value={form[k] ?? ""} onChange={e => setDraft({ ...form, [k]: e.target.value === "" ? undefined : Number(e.target.value) })}/><span>{k === "soreness" || k === "stress" ? "1 = low, 10 = high" : "1 = poor, 10 = excellent"}</span></label>)}</div><button className="primary-button">{selected ? "Update check-in" : "Save check-in"}</button>{selected && <button type="button" className="text-button" onClick={() => void remove()}>Remove</button>}</fieldset></form>
    {result && <div className="readiness-result"><strong className={`readiness-status readiness-${Math.floor(result.score/20)}`}>{result.score} / 100 · {result.status}</strong><p>Six factors have equal weight. Sleep hours reach 100 at 8 hours; positive ratings map 1–10 to 0–100. Soreness and stress are reversed.</p>{result.factors.map(f => <label className="readiness-factor" key={f.name}><span>{f.name}: {Math.round(f.score)} / 100 {f.score >= 60 ? "supports readiness" : "reduces readiness"}</span><progress max={100} value={f.score}/></label>)}</div>}
  </section><section className="panel athlete-panel"><h2>Recovery trend</h2>{!data.loaded.readiness && !data.error ? <p role="status">Loading check-ins...</p> : !history.length ? <p>Your recovery trend appears after your first check-in.</p> : <><Chart points={history.map(c => ({ date: c.date, value: readiness(c).score }))} unit="/ 100"/><div className="overflow-x-auto"><table className="history-table"><thead><tr><th>Date</th><th>Readiness</th><th>Status</th><th>Sleep</th></tr></thead><tbody>{history.slice().reverse().map(c => <tr key={c.date}><td><button className="text-button" onClick={() => setDate(c.date)}>{c.date}</button></td><td>{readiness(c).score}</td><td>{readiness(c).status}</td><td>{c.sleepHours} hours</td></tr>)}</tbody></table></div></>}</section></>;
}

export function AthleteOverview({ data, sessions, today, planning }: { data: AthleteData; sessions: WorkoutSession[]; today: string; planning: Planning }) {
  const load = trainingLoadReport(sessions, today), checkIn = data.checkIns.find(c => c.date === today), ready = checkIn ? readiness(checkIn) : null;
  const groups = testProgress([...data.tests, ...workoutTestRecords(sessions, data.tests[0]?.userId ?? "")].filter(t => t.date <= today));
  const prs = groups.flatMap(g => g.prs).sort((a,b) => b.record.date.localeCompare(a.record.date)).slice(0,3);
  const recent = sessions.filter(s => s.date <= today).sort((a,b) => b.date.localeCompare(a.date)).slice(0,3);
  const upcoming = [...planning.documents.map(p => ({ id:p.id, date:p.date, title:p.title, href:`/workout-plan?document=${p.id}` })), ...planning.plans.filter(p => !sessions.some(s => s.plannedWorkoutId === p.id)).map(p => ({ id:p.id, date:p.date, title:p.input.title, href:"/planning" }))].filter(p => p.date >= today).sort((a,b) => a.date.localeCompare(b.date))[0];
  let recommendation = "Log today's readiness check-in to help choose your training intensity.";
  if (ready) recommendation = ready.score < 40 ? "Your check-in suggests low readiness. Consider rest or a lighter session today." : checkIn!.soreness >= 7 ? "Your reported soreness is high. Consider reducing today's intensity." : ready.score < 80 ? "Your readiness is moderate. Adjust today's session to how you feel." : "Your reported readiness is high. Follow your planned session and monitor how you feel.";
  if (ready && ready.score >= 80 && !load.missingLoad && !load.previousMissingLoad && load.previousWeekLoad && load.weekLoad !== null && Math.abs(load.weekLoad/load.previousWeekLoad-1) <= 0.15) recommendation = "Your readiness is high and your last 7 days of workload are within 15% of the previous 7 days.";
  return <>
    <section className="panel athlete-panel"><h2>{data.profile?.sport && data.profile.sport !== "Other" ? `${data.profile.sport} training` : "Your athlete workspace"}</h2>{data.profile?.primaryGoal && <p>Current goal: {data.profile.primaryGoal}</p>}<div className="athlete-stats"><Stat title="Today's readiness">{ready ? `${ready.score} / 100 · ${ready.status}` : data.loaded.readiness ? "No check-in today" : "Unavailable until loaded"}</Stat><Stat title="Last 7 days load">{load.weekLoad === null ? "Not measured" : `${load.weekLoad.toFixed(0)} AU`}</Stat><Stat title="Workouts · last 7 days">{load.sessions}</Stat><Stat title="Current training streak">{load.streak} days</Stat></div><p>Rest days are useful too. A streak is descriptive, not a daily training target.</p>
    <h3>Today&apos;s recommendation</h3><p>{recommendation}</p><Link href="/recovery">Daily readiness check-in</Link>
    {!data.profile || !sessions.length || !data.checkIns.length || !data.tests.length ? <details open><summary>Build your baseline</summary><ul><li><Link href="/settings">{data.profile ? "Completed" : "Add"} athlete profile</Link></li><li><Link href="/logger">{sessions.length ? "Completed" : "Record"} first workout</Link></li><li><Link href="/recovery">{data.checkIns.length ? "Completed" : "Record"} readiness check-in</Link></li><li><Link href="/performance/testing">{data.tests.length ? "Completed" : "Record"} performance test</Link></li></ul></details> : null}
    </section>
    <section className="panel athlete-panel"><h2>Training load</h2><p>Session load = duration in minutes × overall session RPE. The chart uses a rolling 28-day window.</p><div className="athlete-stats"><Stat title="Today">{load.todayLoad === null ? "Not measured" : `${load.todayLoad} AU`}</Stat><Stat title="Previous 7 days">{load.previousWeekLoad === null ? "Not measured" : `${load.previousWeekLoad} AU`}</Stat><Stat title="Mean session RPE · last 7 days">{load.averageRpe?.toFixed(1) ?? "Not measured"}</Stat><Stat title="Rest days · last 7 days">{load.restDays}</Stat></div>{load.missingLoad > 0 && <p>{load.missingLoad} session(s) in the last 7 days lack duration or session RPE. Load totals are partial.</p>}<Chart points={load.points.map(p => ({ date:p.date, value:p.load }))} unit="AU"/><details><summary>Daily load report</summary><div className="overflow-x-auto"><table className="history-table"><thead><tr><th>Date</th><th>Load (AU)</th><th>Sessions</th><th>Measured sessions</th></tr></thead><tbody>{load.points.slice().reverse().map(p => <tr key={p.date}><td>{p.date}</td><td>{p.load ?? "Not measured"}</td><td>{p.sessions}</td><td>{p.measured}</td></tr>)}</tbody></table></div></details></section>
    <div className="athlete-columns"><section className="panel athlete-panel"><h2>Recent personal records</h2>{prs.length ? prs.map(pr => <p key={pr.record.id}><strong>{pr.record.name}: {pr.record.result} {pr.record.unit}</strong><br/>{pr.record.date} · Improvement {pr.improvement.toFixed(2)} {pr.record.unit}</p>) : <p>Record comparable tests to track new personal records.</p>}<Link href="/performance/records">All personal records</Link><h3>Performance trends</h3>{groups.length ? groups.slice(0,3).map(g => <p key={g.key}>{g.latest.name}: {g.improvementPercent === null ? "Baseline recorded" : `${g.improvementPercent.toFixed(1)}% improvement from baseline`}</p>) : <p>No performance tests yet.</p>}<Link href="/performance/testing">Tests and progress charts</Link></section>
    <section className="panel athlete-panel"><h2>Upcoming workout</h2>{upcoming ? <p><Link href={upcoming.href}>{upcoming.title}</Link><br/>{upcoming.date}</p> : <p>No upcoming workout. <Link href="/planning">Plan a session</Link></p>}<h3>Recent sessions</h3>{recent.length ? recent.map(s => <p key={s.id}><Link href={`/sessions/${s.id}`}>{s.title}</Link><br/>{s.date}</p>) : <p>No saved sessions yet.</p>}</section></div>
    <section className="panel athlete-panel"><h2>Recovery trend · last 28 days</h2><Chart points={load.points.map(p => ({ date:p.date, value:data.checkIns.some(c => c.date === p.date) ? readiness(data.checkIns.find(c => c.date === p.date)!).score : null }))} unit="/ 100"/><Link href="/recovery">View check-ins and score breakdowns</Link></section>
  </>;
}
