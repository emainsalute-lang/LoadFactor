"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AccountUser } from "@/lib/account-types";
import { api } from "@/lib/client-api";
import { noCoachPermissions, type AthleteCoachView, type CoachPermissions, type CoachingState, type CompletionRow, type ProgressReport } from "@/lib/coaching";
import { shiftDate, type Planning } from "@/lib/planning";
import { weekStart, weightFromKg } from "@/lib/analytics";
import type { WorkoutTemplate } from "@/lib/workspace";
import type { HeightUnit, WeightUnit } from "@/lib/types";
import SessionDetail from "./session-detail";
const permissionLabels: { key: keyof CoachPermissions; label: string }[] = [
  { key: "sessions", label: "View workouts and session notes" }, { key: "wellness", label: "View wellness and bodyweight reports" },
  { key: "planning", label: "View training plans and goals" }, { key: "assignPlans", label: "Assign new training plans" }, { key: "feedback", label: "Comment and exchange feedback (also needs workout access)" },
];
const emptyState: CoachingState = { connections: [], teams: [], invitations: [], reports: [], assignments: [] };
async function coachingRequest<T>(accountId: string, action: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch("/api/coaching/" + action, { method, cache: "no-store", headers: { "X-LoadFactor-Account": accountId, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error ?? "Coaching request failed."); return value;
}
export default function CoachingPanel({ account, today, weightUnit, heightUnit, planning }: { account: AccountUser | null; today: string; weightUnit: WeightUnit; heightUnit: HeightUnit; planning: Planning }) {
  const [state, setState] = useState(emptyState);
  const [personalTemplates, setPersonalTemplates] = useState<WorkoutTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [acceptCode, setAcceptCode] = useState("");
  const [invitationPreview, setInvitationPreview] = useState<{ coachName: string; teamName: string; expiresAt: string } | null>(null);
  const [previewedCode, setPreviewedCode] = useState("");
  const [acceptPermissions, setAcceptPermissions] = useState<CoachPermissions>(noCoachPermissions);
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, CoachPermissions>>({});
  const [personalTemplateId, setPersonalTemplateId] = useState("");
  const [teamTemplateId, setTeamTemplateId] = useState("");
  const [athleteIds, setAthleteIds] = useState<string[]>([]);
  const [assignmentStart, setAssignmentStart] = useState(today);
  const [weeks, setWeeks] = useState(1);
  const [weekdays, setWeekdays] = useState([1, 3, 5]);
  const [selectedAthlete, setSelectedAthlete] = useState("");
  const [view, setView] = useState<AthleteCoachView | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [completionFrom, setCompletionFrom] = useState(weekStart(today));
  const [completionTo, setCompletionTo] = useState(shiftDate(weekStart(today), 6));
  const [completion, setCompletion] = useState<CompletionRow[]>([]);
  const [reportTitle, setReportTitle] = useState("Progress report");
  const [reportFrom, setReportFrom] = useState(shiftDate(today, -29));
  const [reportTo, setReportTo] = useState(today);
  const [expiresDays, setExpiresDays] = useState(30);
  const [createdReport, setCreatedReport] = useState<{ id: string; url: string; snapshot: ProgressReport } | null>(null);
  const mutationVersion = useRef(0), mutating = useRef(false);
  const coach = account?.role === "coach", team = state.teams.find(t => t.id === teamId) ?? state.teams[0];
  const personalTemplate = personalTemplates.find(t => t.id === personalTemplateId) ?? personalTemplates[0];
  const teamTemplate = team?.templates.find(t => t.id === teamTemplateId) ?? team?.templates[0];
  useEffect(() => {
    if (!account) return; let stopped = false, reading = false;
    async function load() {
      if (reading || mutating.current) return; reading = true; const version = mutationVersion.current;
      try {
        const [next, workspace] = await Promise.all([coachingRequest<CoachingState>(account!.id, "state"), api<{ templates: WorkoutTemplate[] }>("/api/account/workspace")]);
        if (!stopped && version === mutationVersion.current) { setState(next); setPersonalTemplates(workspace.templates); }
      } catch (e) { if (!stopped) { setState(emptyState); setView(null); setError(e instanceof Error ? e.message : "Could not load coaching."); } } finally { reading = false; }
    }
    void load(); const timer = window.setInterval(() => void load(), 15000); window.addEventListener("focus", load); window.addEventListener("loadfactor-assets", load);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("focus", load); window.removeEventListener("loadfactor-assets", load); };
  }, [account]);
  useEffect(() => {
    if (!account || !coach || !selectedAthlete) return;
    let stopped = false, reading = false;
    async function load() {
      if (reading) return; reading = true;
      try { const next = await coachingRequest<AthleteCoachView>(account!.id, "athlete?athleteId=" + encodeURIComponent(selectedAthlete)); if (!stopped) setView(next); }
      catch (e) { if (!stopped) { setView(null); setError(e instanceof Error ? e.message : "Athlete access is unavailable."); } } finally { reading = false; }
    }
    void load(); const timer = window.setInterval(() => void load(), 15000); window.addEventListener("focus", load);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [account, coach, selectedAthlete]);
  useEffect(() => {
    if (!account || !coach || !team?.id || !completionFrom || !completionTo || completionFrom > completionTo) return;
    let stopped = false, reading = false;
    const id = team.id;
    async function load() {
      if (reading) return; reading = true;
      try { const next = await coachingRequest<{ rows: CompletionRow[] }>(account!.id, "completion?teamId=" + encodeURIComponent(id) + "&from=" + completionFrom + "&to=" + completionTo); if (!stopped) setCompletion(next.rows); }
      catch (e) { if (!stopped) { setCompletion([]); setError(e instanceof Error ? e.message : "Completion dashboard is unavailable."); } } finally { reading = false; }
    }
    void load(); const timer = window.setInterval(() => void load(), 15000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [account, coach, team?.id, completionFrom, completionTo]);
  async function action(work: () => Promise<string | void>) {
    if (mutating.current || !account) return; mutating.current = true; mutationVersion.current++; setBusy(true); setError(""); setNotice("");
    try {
      const message = await work(); setState(await coachingRequest<CoachingState>(account.id, "state"));
      setNotice(message ?? "Saved."); window.dispatchEvent(new Event("loadfactor-sync"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save coaching changes."); } finally { mutationVersion.current++; mutating.current = false; setBusy(false); }
  }
  async function previewInvitationCode() {
    if (!account || !acceptCode.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const code = acceptCode.trim();
      const preview = await coachingRequest<{ coachName: string; teamName: string; expiresAt: string }>(account.id, "preview-invitation", "POST", { code });
      setInvitationPreview(preview);
      setPreviewedCode(code);
      setNotice("Invitation verified. Review the coach and team before granting access.");
    } catch (e) {
      setInvitationPreview(null);
      setPreviewedCode("");
      setError(e instanceof Error ? e.message : "Could not verify this invitation.");
    } finally {
      setBusy(false);
    }
  }
  function permissionFields(value: CoachPermissions, change: (next: CoachPermissions) => void) {
    return <div className="phase-controls">{permissionLabels.map(p => <label key={p.key}><input type="checkbox" checked={value[p.key]} onChange={e => change({ ...value, [p.key]: e.target.checked })}/> {p.label}</label>)}</div>;
  }
  const selectedSession = view?.sessions?.find(s => s.id === sessionId) ?? view?.sessions?.[0];
  function createReport(event: FormEvent) {
    event.preventDefault(); void action(async () => {
      const result = await coachingRequest<{ id: string; token: string; snapshot: ProgressReport }>(account!.id, "reports", "POST", { title: reportTitle, from: reportFrom, to: reportTo, expiresDays });
      setCreatedReport({ id: result.id, url: window.location.origin + "/reports/" + result.token, snapshot: result.snapshot }); return "Report created. Save its link now; the server keeps only a hash of the access token.";
    });
  }
  return <section id="coaching" className="panel scroll-mt-6"><div className="section-title"><div><span className="eyebrow">Coaching</span><h2>{coach ? "Coach workspace" : "Coaching and progress reports"}</h2></div></div>
    {!account ? <p>Create an athlete or coach account in Account & data to use connections, teams, feedback and shareable reports.</p> : <>
      <p className="account-description">{coach ? "Invite athletes to your teams. Each athlete chooses the data and actions they allow." : "Accept an invitation using the account email it was addressed to. Your connected coach can add you to their teams; choose each data and action permission below."}</p>
      <fieldset disabled={busy}>
      {coach ? <>
        <form onSubmit={e => { e.preventDefault(); void action(async () => { const result = await coachingRequest<{ id: string }>(account.id, "teams", "POST", { name: teamName }); setTeamId(result.id); setTeamName(""); return "Team created."; }); }}><label className="field-label">New team name<input required maxLength={80} value={teamName} onChange={e => setTeamName(e.target.value)}/></label><button className="secondary-button">Create team</button></form>
        <label className="field-label">Team<select value={team?.id ?? ""} onChange={e => { setTeamId(e.target.value); setAthleteIds([]); setCompletion([]); }}><option value="" disabled>Select a team</option>{state.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        {team && <>
          <form onSubmit={e => { e.preventDefault(); void action(async () => { const result = await coachingRequest<{ code: string }>(account.id, "invitations", "POST", { email, teamId: team.id }); setInviteCode(result.code); return "Invitation created. Share this code with the athlete manually; it expires in seven days."; }); }}><label className="field-label">Athlete account email<input type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)}/></label><button className="secondary-button">Create invitation code</button></form>
          {inviteCode && <label className="field-label">Private invitation code (shown once)<input readOnly value={inviteCode}/></label>}
          <h3>Team roster</h3>{team.members.map(member => <div className="template-item" key={member.id}><span>{member.name} / {member.sport}</span><button type="button" className="text-button" onClick={() => { setSelectedAthlete(member.id); setView(null); }}>View permitted data</button><button type="button" className="text-button" onClick={() => void action(async () => { await coachingRequest(account.id, "members", "DELETE", { teamId: team.id, athleteId: member.id }); return "Athlete removed from this team."; })}>Remove from team</button></div>)}{!team.members.length && <p>No athletes have joined this team yet.</p>}
          <label className="field-label">Add an already-connected athlete<select value="" onChange={e => { if (e.target.value) void action(async () => { await coachingRequest(account.id, "members", "POST", { teamId: team.id, athleteId: e.target.value }); }); }}><option value="">Choose an athlete</option>{state.connections.filter(c => !team.members.some(m => m.id === c.athleteId)).map(c => <option key={c.athleteId} value={c.athleteId}>{c.name}</option>)}</select></label>
          <h3>Team workout templates</h3><label className="field-label">Personal template<select value={personalTemplate?.id ?? ""} onChange={e => setPersonalTemplateId(e.target.value)}><option value="" disabled>Save a template in the logger first</option>{personalTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><button disabled={!personalTemplate} type="button" className="secondary-button" onClick={() => void action(async () => { await coachingRequest(account.id, "templates", "POST", { teamId: team.id, templateId: personalTemplate!.id }); return "A snapshot of the template is now shared with this team."; })}>Share template with team</button>
          {team.templates.map(t => <div className="template-item" key={t.id}><span>{t.name} / {t.input.exercises.length} target sets</span><button type="button" className="text-button" onClick={() => void action(async () => { await coachingRequest(account.id, "templates", "DELETE", { teamId: team.id, templateId: t.id }); })}>Remove shared template</button></div>)}
          <details><summary>Assign a training plan</summary><form onSubmit={e => { e.preventDefault(); void action(async () => { const result = await coachingRequest<{ athletes: number; workouts: number }>(account.id, "assign", "POST", { teamId: team.id, templateId: teamTemplate?.id, athleteIds, start: assignmentStart, weeks, weekdays }); return result.workouts + " workouts assigned to " + result.athletes + " athletes. Athletes can review and edit their targets in Schedule & goals."; }); }}><div className="history-filters"><label className="field-label">Team template<select value={teamTemplate?.id ?? ""} onChange={e => setTeamTemplateId(e.target.value)}><option value="" disabled>Choose a team template</option>{team.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="field-label">Start date<input type="date" min={today} required value={assignmentStart} onChange={e => setAssignmentStart(e.target.value)}/></label><label className="field-label">Weeks<input type="number" min="1" max="12" required value={weeks} onChange={e => setWeeks(Number(e.target.value))}/></label></div><div className="phase-controls">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => <label key={day}><input type="checkbox" checked={weekdays.includes(i)} onChange={e => setWeekdays(current => e.target.checked ? [...current, i] : current.filter(d => d !== i))}/> {day}</label>)}</div><h4>Athletes</h4>{team.members.map(m => <label key={m.id} className="recovery-ack"><input type="checkbox" checked={athleteIds.includes(m.id)} onChange={e => setAthleteIds(current => e.target.checked ? [...current, m.id] : current.filter(id => id !== m.id))}/>{m.name}</label>)}<p className="account-description">Every selected athlete must grant plan assignment permission. All assignments are saved together. Templates are copied into the athlete schedule.</p><button className="primary-button" disabled={!teamTemplate || !athleteIds.length || !weekdays.length}>Assign plan</button></form></details>
          <h3>Team training completion</h3><div className="history-filters"><label className="field-label">Scheduled from<input type="date" required value={completionFrom} onChange={e => { setCompletionFrom(e.target.value); setCompletion([]); }}/></label><label className="field-label">Scheduled through<input type="date" required value={completionTo} onChange={e => { setCompletionTo(e.target.value); setCompletion([]); }}/></label></div><p className="account-description">Counts assignments made by this coach for this team, by scheduled date. Athletes must grant both workout and planning access.</p><div className="table-scroll"><table><thead><tr><th>Athlete</th><th>Scheduled</th><th>Completed</th><th>Missed</th><th>Upcoming / due</th></tr></thead><tbody>{completion.map(row => <tr key={row.athleteId}><td>{row.name}</td>{row.allowed ? <><td>{row.scheduled}</td><td>{row.completed}</td><td>{row.missed}</td><td>{row.upcoming}</td></> : <td colSpan={4}>Athlete has not granted access</td>}</tr>)}</tbody></table></div>
          <details><summary>Manage this team</summary><button className="text-button" type="button" onClick={() => void action(async () => { await coachingRequest(account.id, "teams", "DELETE", { id: team.id }); setTeamId(""); setCompletion([]); return "Team removed. Athlete connections and previously assigned plans remain available."; })}>Remove team, its roster and shared templates</button></details>
        </>}
        <details><summary>Invitations</summary>{state.invitations.map(i => <div className="template-item" key={i.id}><span>{i.email} / {i.teamName} / {i.status} / expires {i.expiresAt.slice(0, 10)}</span>{i.status === "Pending" && <button type="button" className="text-button" onClick={() => void action(async () => { await coachingRequest(account.id, "invitations", "DELETE", { id: i.id }); setInviteCode(""); })}>Revoke invitation</button>}</div>)}</details>
        {view && <section className="set-row"><h3>{view.athlete.name} / permitted athlete data</h3>{view.wellness && <details><summary>Wellness check-ins ({view.wellness.length})</summary><div className="table-scroll"><table><thead><tr><th>Date</th><th>Sleep hours</th><th>Quality</th><th>Soreness</th><th>Stress</th><th>Mood</th><th>Bodyweight ({weightUnit})</th><th>Notes</th></tr></thead><tbody>{view.wellness.map(w => <tr key={w.date}><td>{w.date}</td><td>{w.sleepHours ?? "-"}</td><td>{w.sleepQuality ?? "-"}</td><td>{w.soreness ?? "-"}</td><td>{w.stress ?? "-"}</td><td>{w.mood ?? "-"}</td><td>{w.bodyweightKg === null ? "-" : weightFromKg(w.bodyweightKg, weightUnit).toFixed(1)}</td><td>{w.notes}</td></tr>)}</tbody></table></div></details>}{view.planning && <details><summary>Training plans ({view.planning.plans.length})</summary>{view.planning.plans.map(p => <p key={p.id}>{p.date} / {p.input.title} / {p.input.exercises.length} target sets{p.deload ? " / Deload" : ""}</p>)}</details>}{view.sessions && <><label className="field-label">Workout<select value={selectedSession?.id ?? ""} onChange={e => setSessionId(e.target.value)}>{view.sessions.map(s => <option key={s.id} value={s.id}>{s.date} / {s.title}</option>)}</select></label>{selectedSession && <SessionDetail key={selectedSession.id} session={selectedSession} weightUnit={weightUnit} heightUnit={heightUnit} feedbackRole="coach" feedbackEnabled={view.permissions.feedback}/>}</>}{!view.sessions && !view.wellness && !view.planning && <p>This athlete has shared connection details only.</p>}</section>}
      </> : <>
        <form onSubmit={e => { e.preventDefault(); void action(async () => { await coachingRequest(account.id, "accept", "POST", { code: acceptCode.trim(), permissions: acceptPermissions }); setAcceptCode(""); setInvitationPreview(null); setPreviewedCode(""); setAcceptPermissions(noCoachPermissions); return "Coach connection accepted. Update or revoke permissions whenever you choose."; }); }}><label className="field-label">Invitation code<input required minLength={64} maxLength={64} value={acceptCode} onChange={e => { setAcceptCode(e.target.value); if (e.target.value.trim() !== previewedCode) { setInvitationPreview(null); setPreviewedCode(""); } }} autoComplete="off"/></label><button className="secondary-button" type="button" disabled={acceptCode.trim().length !== 64} onClick={() => void previewInvitationCode()}>Verify invitation</button>{invitationPreview && previewedCode === acceptCode.trim() && <><p className="account-description">Invited by {invitationPreview.coachName} to join {invitationPreview.teamName}. Expires {new Date(invitationPreview.expiresAt).toLocaleString()}. Review the permissions you want to grant before accepting.</p>{permissionFields(acceptPermissions, setAcceptPermissions)}<button className="primary-button">Accept invitation with these permissions</button></>}</form>
        <h3>Your coach connections</h3>{state.connections.map(connection => { const permissions = permissionDrafts[connection.coachId] ?? connection.permissions; return <div className="set-row" key={connection.coachId}><h4>{connection.name}</h4>{permissionFields(permissions, next => setPermissionDrafts(current => ({ ...current, [connection.coachId]: next })))}<button className="secondary-button" type="button" onClick={() => void action(async () => { await coachingRequest(account.id, "permissions", "PUT", { coachId: connection.coachId, permissions }); setPermissionDrafts(current => { const next = { ...current }; delete next[connection.coachId]; return next; }); return "Coach permissions updated."; })}>Save permissions</button><button className="text-button" type="button" onClick={() => void action(async () => { await coachingRequest(account.id, "disconnect", "DELETE", { coachId: connection.coachId }); return "Coach disconnected and team memberships removed. Assigned plans remain yours."; })}>Disconnect coach and revoke access</button></div>; })}
        <h3>Your teams and shared templates</h3>{state.teams.map(t => <div className="set-row" key={t.id}><h4>{t.name} / {t.coachName}</h4>{t.templates.map(template => <div className="template-item" key={template.id}><span>{template.name} / {template.input.exercises.length} target sets</span><button type="button" className="secondary-button" onClick={() => void action(async () => { await coachingRequest(account.id, "copy-template", "POST", { teamId: t.id, templateId: template.id }); window.location.reload(); })}>Copy to my workout templates</button></div>)}</div>)}
        <details><summary>Coach-assigned schedules</summary>{state.assignments.map(a => { const plan = planning.plans.find(p => p.id === a.planId); return plan ? <p key={a.planId}>{plan.date} / {plan.input.title} / assigned by {a.coachName} / {a.teamName}</p> : null; })}</details>
        <p className="account-description">Open a saved workout in Training history to read coach comments and reply. Feedback access also needs workout access.</p>
      </>}
      <h3>Shareable progress reports</h3><p className="account-description">Create a snapshot of your name and selected dates and their training totals, strength summaries and test results. Private wellness, bodyweight, session notes, protocol notes and feedback are excluded. Anyone with the link can read it until expiry or revocation. Previously downloaded copies remain with their recipients.</p>
      <form onSubmit={createReport}><div className="history-filters"><label className="field-label">Report title<input required maxLength={80} value={reportTitle} onChange={e => setReportTitle(e.target.value)}/></label><label className="field-label">From<input type="date" required max={today} value={reportFrom} onChange={e => setReportFrom(e.target.value)}/></label><label className="field-label">Through<input type="date" required max={today} value={reportTo} onChange={e => setReportTo(e.target.value)}/></label><label className="field-label">Expires after (days)<input type="number" required min="1" max="90" value={expiresDays} onChange={e => setExpiresDays(Number(e.target.value))}/></label></div><button className="secondary-button">Create report and private link</button></form>
      {createdReport && <div className="set-row"><h4>{createdReport.snapshot.title}</h4><p>Snapshot: {createdReport.snapshot.totals.sessions} workouts, {createdReport.snapshot.totals.volumeKg.toFixed(1)} kg x reps.</p><label className="field-label">Report link (save it now)<input value={createdReport.url} readOnly/></label><a className="text-button" href={createdReport.url} target="_blank" rel="noreferrer">Preview report</a><button className="text-button" type="button" onClick={() => { void navigator.clipboard.writeText(createdReport.url).then(() => setNotice("Report link copied.")).catch(() => setError("Select and copy the report link above.")); }}>Copy link</button></div>}
      {state.reports.map(report => <div className="template-item" key={report.id}><span>{report.title} / {report.from} to {report.to} / {report.revoked ? "Revoked" : "expires " + report.expiresAt.slice(0, 10)}</span>{!report.revoked && <button className="text-button" type="button" onClick={() => void action(async () => { await coachingRequest(account.id, "reports", "DELETE", { id: report.id }); if (createdReport?.id === report.id) setCreatedReport(null); return "Report access revoked immediately."; })}>Revoke report access</button>}</div>)}
      </fieldset>
    </>}
    {error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="success-message" role="status">{notice}</p>}
  </section>;
}
