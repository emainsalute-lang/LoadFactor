import { randomBytes, randomUUID } from "node:crypto";
import { AccountStore, ServiceError, digest } from "./store";
import { acceptInvitationSchema, assignmentSchema, buildProgressReport, coachPermissionsSchema, commentSchema, invitationSchema, reportSchema, type AthleteCoachView, type CoachPermissions, type CoachingState, type CompletionRow, type Feedback, type ProgressReport, type TeamView } from "../coaching";
import { athleteToday } from "../account-types";
import { blockPlans, planningSchema } from "../planning";
import { templatesSchema } from "../workspace";
import { z } from "zod";

type InvitationRow = { id: string; coach_id: string; team_id: string; email: string; expires: number; accepted_at: number | null; revoked: number };
type TeamRow = { id: string; coach_id: string; name: string };
type FeedbackRow = { id: string; athlete_id: string; coach_id: string; session_id: string; author_id: string; body: string; reply_to: string | null; created_at: string };
export class CoachingStore {
  constructor(readonly accounts: AccountStore) {
    accounts.db.exec(`
      CREATE TABLE IF NOT EXISTS coach_connections (coach_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, athlete_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, permissions TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(coach_id, athlete_id), CHECK(coach_id <> athlete_id));
      CREATE TABLE IF NOT EXISTS coach_teams (id TEXT PRIMARY KEY, coach_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS coach_members (team_id TEXT NOT NULL REFERENCES coach_teams(id) ON DELETE CASCADE, athlete_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(team_id, athlete_id));
      CREATE TABLE IF NOT EXISTS coach_invitations (id TEXT PRIMARY KEY, coach_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, team_id TEXT NOT NULL REFERENCES coach_teams(id) ON DELETE CASCADE, email TEXT NOT NULL, code_hash TEXT NOT NULL UNIQUE, expires INTEGER NOT NULL, accepted_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS coach_templates (id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES coach_teams(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS coach_assignments (id TEXT PRIMARY KEY, coach_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, athlete_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, team_id TEXT REFERENCES coach_teams(id) ON DELETE SET NULL, plan_id TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS coach_feedback (id TEXT PRIMARY KEY, athlete_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, coach_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, session_id TEXT NOT NULL, author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, reply_to TEXT REFERENCES coach_feedback(id) ON DELETE CASCADE, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS coach_feedback_session ON coach_feedback(athlete_id, session_id);
      CREATE TABLE IF NOT EXISTS progress_reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, data TEXT NOT NULL, expires INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
    `);
  }
  coach(id: string) { const user = this.accounts.user(id); if (user.role !== "coach") throw new ServiceError("A coach account is required.", 403); return user; }
  team(coachId: string, teamId: string): TeamRow {
    this.coach(coachId);
    const team = this.accounts.db.prepare("SELECT * FROM coach_teams WHERE id = ? AND coach_id = ?").get(teamId, coachId) as TeamRow | undefined;
    if (!team) throw new ServiceError("Team not found.", 404); return team;
  }
  permission(coachId: string, athleteId: string, ...required: (keyof CoachPermissions)[]): CoachPermissions {
    this.coach(coachId);
    const row = this.accounts.db.prepare("SELECT permissions FROM coach_connections WHERE coach_id = ? AND athlete_id = ?").get(coachId, athleteId) as { permissions: string } | undefined;
    if (!row || this.accounts.user(athleteId).role !== "athlete") throw new ServiceError("Athlete connection is not available.", 403);
    const permissions = coachPermissionsSchema.parse(JSON.parse(row.permissions));
    if (required.some(key => !permissions[key])) throw new ServiceError("The athlete has not granted this permission.", 403);
    return permissions;
  }
  createTeam(coachId: string, name: string) {
    this.coach(coachId); const parsed = z.string().trim().min(1).max(80).parse(name);
    const count = this.accounts.db.prepare("SELECT count(*) AS n FROM coach_teams WHERE coach_id = ?").get(coachId) as { n: number };
    if (count.n >= 50) throw new ServiceError("The team limit is 50.", 422);
    const id = randomUUID(); this.accounts.db.prepare("INSERT INTO coach_teams VALUES (?, ?, ?)").run(id, coachId, parsed); return { id, name: parsed };
  }
  deleteTeam(coachId: string, teamId: string) { this.team(coachId, teamId); this.accounts.db.prepare("DELETE FROM coach_teams WHERE id = ? AND coach_id = ?").run(teamId, coachId); }
  invite(coachId: string, value: z.input<typeof invitationSchema>) {
    const input = invitationSchema.parse(value); this.team(coachId, input.teamId); this.accounts.throttle("coach-invite:" + coachId, 30);
    if (input.email === this.accounts.user(coachId).email) throw new ServiceError("Invite an athlete other than yourself.", 422);
    const count = this.accounts.db.prepare("SELECT count(*) AS n FROM coach_invitations WHERE coach_id = ? AND accepted_at IS NULL AND revoked = 0 AND expires > ?").get(coachId, Date.now()) as { n: number };
    if (count.n >= 100) throw new ServiceError("Revoke pending invitations before adding more.", 422);
    const id = randomUUID(), code = randomBytes(32).toString("hex"), expires = Date.now() + 7 * 86400_000;
    this.accounts.db.prepare("INSERT INTO coach_invitations (id, coach_id, team_id, email, code_hash, expires) VALUES (?, ?, ?, ?, ?, ?)").run(id, coachId, input.teamId, input.email, digest(code), expires);
    return { id, code, expiresAt: new Date(expires).toISOString() };
  }
  revokeInvitation(coachId: string, id: string) {
    this.coach(coachId); const result = this.accounts.db.prepare("UPDATE coach_invitations SET revoked = 1 WHERE id = ? AND coach_id = ?").run(id, coachId);
    if (!result.changes) throw new ServiceError("Invitation not found.", 404);
  }
  previewInvitation(athleteId: string, code: string) {
    const parsed = acceptInvitationSchema.shape.code.parse(code), athlete = this.accounts.user(athleteId);
    if (athlete.role !== "athlete") throw new ServiceError("Use an athlete account to review this invitation.", 403);
    const invitation = this.accounts.db.prepare("SELECT * FROM coach_invitations WHERE code_hash = ? AND email = ? AND revoked = 0 AND accepted_at IS NULL AND expires > ?").get(digest(parsed), athlete.email, Date.now()) as InvitationRow | undefined;
    if (!invitation) throw new ServiceError("Invitation is invalid, expired, used, or addressed to another account.", 404);
    const coach = this.coach(invitation.coach_id), team = this.team(coach.id, invitation.team_id);
    return { coachName: coach.name, teamName: team.name, expiresAt: new Date(invitation.expires).toISOString() };
  }
  accept(athleteId: string, value: z.input<typeof acceptInvitationSchema>) {
    const input = acceptInvitationSchema.parse(value), athlete = this.accounts.user(athleteId);
    if (athlete.role !== "athlete") throw new ServiceError("Accept invitations using an athlete account.", 403);
    const invitation = this.accounts.db.prepare("SELECT * FROM coach_invitations WHERE code_hash = ? AND email = ? AND revoked = 0 AND accepted_at IS NULL AND expires > ?").get(digest(input.code), athlete.email, Date.now()) as InvitationRow | undefined;
    if (!invitation) throw new ServiceError("Invitation is invalid, expired, used, or addressed to another account.", 404);
    this.coach(invitation.coach_id); this.team(invitation.coach_id, invitation.team_id);
    const members = this.accounts.db.prepare("SELECT count(*) AS n FROM coach_members WHERE team_id = ?").get(invitation.team_id) as { n: number };
    if (members.n >= 100 && !this.accounts.db.prepare("SELECT 1 FROM coach_members WHERE team_id = ? AND athlete_id = ?").get(invitation.team_id, athleteId)) throw new ServiceError("This team is full.", 422);
    this.accounts.transaction(() => {
      this.accounts.db.prepare("INSERT INTO coach_connections VALUES (?, ?, ?, ?) ON CONFLICT(coach_id, athlete_id) DO NOTHING").run(invitation.coach_id, athleteId, JSON.stringify(input.permissions), new Date().toISOString());
      this.accounts.db.prepare("INSERT INTO coach_members VALUES (?, ?) ON CONFLICT DO NOTHING").run(invitation.team_id, athleteId);
      this.accounts.db.prepare("UPDATE coach_invitations SET accepted_at = ? WHERE id = ?").run(Date.now(), invitation.id);
    });
    return this.state(athleteId);
  }
  setPermissions(athleteId: string, coachId: string, value: CoachPermissions) {
    this.accounts.user(athleteId); const permissions = coachPermissionsSchema.parse(value);
    const result = this.accounts.db.prepare("UPDATE coach_connections SET permissions = ? WHERE athlete_id = ? AND coach_id = ?").run(JSON.stringify(permissions), athleteId, coachId);
    if (!result.changes) throw new ServiceError("Coach connection not found.", 404);
    return this.state(athleteId);
  }
  disconnect(athleteId: string, coachId: string) {
    this.accounts.user(athleteId);
    this.accounts.transaction(() => {
      this.accounts.db.prepare("DELETE FROM coach_members WHERE athlete_id = ? AND team_id IN (SELECT id FROM coach_teams WHERE coach_id = ?)").run(athleteId, coachId);
      this.accounts.db.prepare("DELETE FROM coach_connections WHERE athlete_id = ? AND coach_id = ?").run(athleteId, coachId);
      this.accounts.db.prepare("UPDATE coach_invitations SET revoked = 1 WHERE coach_id = ? AND email = ?").run(coachId, this.accounts.user(athleteId).email);
    });
    return this.state(athleteId);
  }
  member(coachId: string, teamId: string, athleteId: string, add: boolean) {
    this.team(coachId, teamId); this.permission(coachId, athleteId);
    if (add) {
      const count = this.accounts.db.prepare("SELECT count(*) AS n FROM coach_members WHERE team_id = ?").get(teamId) as { n: number };
      if (count.n >= 100) throw new ServiceError("This team is full.", 422);
      this.accounts.db.prepare("INSERT INTO coach_members VALUES (?, ?) ON CONFLICT DO NOTHING").run(teamId, athleteId);
    } else this.accounts.db.prepare("DELETE FROM coach_members WHERE team_id = ? AND athlete_id = ?").run(teamId, athleteId);
  }
  shareTemplate(coachId: string, teamId: string, templateId: string) {
    this.team(coachId, teamId); const template = this.accounts.workspace(coachId).templates.find(t => t.id === templateId);
    if (!template) throw new ServiceError("Save a personal template in the logger first.", 404);
    const count = this.accounts.db.prepare("SELECT count(*) AS n FROM coach_templates WHERE team_id = ?").get(teamId) as { n: number };
    if (count.n >= 50) throw new ServiceError("The team template limit is 50.", 422);
    const copy = templatesSchema.parse([{ ...template, id: randomUUID(), input: { ...template.input, plannedWorkoutId: null, durationMinutes: null, sessionRpe: null, bodyweightKg: null } }])[0];
    this.accounts.db.prepare("INSERT INTO coach_templates VALUES (?, ?, ?)").run(copy.id, teamId, JSON.stringify(copy)); return copy;
  }
  removeTemplate(coachId: string, teamId: string, templateId: string) {
    this.team(coachId, teamId); this.accounts.db.prepare("DELETE FROM coach_templates WHERE id = ? AND team_id = ?").run(templateId, teamId);
  }
  copyTemplate(athleteId: string, teamId: string, templateId: string) {
    this.accounts.user(athleteId);
    const team = this.accounts.db.prepare("SELECT t.* FROM coach_teams t JOIN coach_members m ON m.team_id = t.id WHERE t.id = ? AND m.athlete_id = ?").get(teamId, athleteId) as TeamRow | undefined;
    if (!team) throw new ServiceError("Team template not available.", 404);
    this.permission(team.coach_id, athleteId);
    const row = this.accounts.db.prepare("SELECT data FROM coach_templates WHERE id = ? AND team_id = ?").get(templateId, teamId) as { data: string } | undefined;
    if (!row) throw new ServiceError("Team template not found.", 404);
    const template = templatesSchema.parse([JSON.parse(row.data)])[0], current = this.accounts.workspace(athleteId);
    if (template.input.customExercises.some(exercise => current.custom.some(existing => existing.id === exercise.id && (existing.name !== exercise.name || existing.kind !== exercise.kind)))) throw new ServiceError("This template conflicts with an existing custom exercise.", 422);
    const custom = [...current.custom, ...template.input.customExercises].filter((e, i, all) => all.findIndex(x => x.id === e.id) === i);
    const copy = { ...template, id: randomUUID() };
    this.accounts.saveAssets(athleteId, { custom, templates: [...current.templates, copy] }); return copy;
  }
  athleteView(coachId: string, athleteId: string): AthleteCoachView {
    const permissions = this.permission(coachId, athleteId), user = this.accounts.user(athleteId);
    const result: AthleteCoachView = { athlete: { id: user.id, name: user.name, sport: user.sport }, permissions };
    if (permissions.sessions) result.sessions = this.accounts.workspace(athleteId).records.map(r => r.session);
    if (permissions.wellness) result.wellness = this.accounts.wellness(athleteId);
    if (permissions.planning) result.planning = this.accounts.planning(athleteId);
    return result;
  }
  assign(coachId: string, value: z.input<typeof assignmentSchema>) {
    const input = assignmentSchema.parse(value), team = this.team(coachId, input.teamId);
    const row = this.accounts.db.prepare("SELECT data FROM coach_templates WHERE id = ? AND team_id = ?").get(input.templateId, team.id) as { data: string } | undefined;
    if (!row) throw new ServiceError("Team template not found.", 404);
    const template = templatesSchema.parse([JSON.parse(row.data)])[0];
    const updates = input.athleteIds.map(athleteId => {
      this.permission(coachId, athleteId, "assignPlans");
      if (!this.accounts.db.prepare("SELECT 1 FROM coach_members WHERE team_id = ? AND athlete_id = ?").get(team.id, athleteId)) throw new ServiceError("Assignment requires a member of this team.", 422);
      if (input.start < athleteToday(this.accounts.user(athleteId).timezone)) throw new ServiceError("Assignments must start today or later in each athlete's timezone.", 422);
      const block = { id: randomUUID(), name: ("Team: " + team.name).slice(0, 80), start: input.start, weeks: input.weeks, rule: { mode: "none" as const, increment: 0, deloadEvery: 0, deloadPercent: 0 } };
      const plans = blockPlans(template.input, template.name, block, input.weekdays), current = this.accounts.planning(athleteId);
      return { athleteId, plans, planning: planningSchema.parse({ ...current, blocks: [...current.blocks, block], plans: [...current.plans, ...plans] }) };
    });
    for (const update of updates) this.accounts.backup(update.athleteId);
    this.accounts.transaction(() => {
      for (const update of updates) {
        this.accounts.db.prepare("INSERT INTO training_planning VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data").run(update.athleteId, JSON.stringify(update.planning));
        for (const plan of update.plans) this.accounts.db.prepare("INSERT INTO coach_assignments VALUES (?, ?, ?, ?, ?)").run(randomUUID(), coachId, update.athleteId, team.id, plan.id);
      }
    });
    return { athletes: updates.length, workouts: updates.reduce((sum, update) => sum + update.plans.length, 0) };
  }
  completion(coachId: string, teamId: string, from: string, to: string): CompletionRow[] {
    const team = this.team(coachId, teamId); reportSchema.parse({ title: "Completion", from, to, expiresDays: 1 });
    const members = this.accounts.db.prepare("SELECT athlete_id FROM coach_members WHERE team_id = ?").all(team.id) as { athlete_id: string }[];
    return members.map(({ athlete_id: athleteId }) => {
      const user = this.accounts.user(athleteId), row: CompletionRow = { athleteId, name: user.name, allowed: false };
      try { this.permission(coachId, athleteId, "sessions", "planning"); } catch { return row; }
      const assignments = this.accounts.db.prepare("SELECT plan_id FROM coach_assignments WHERE coach_id = ? AND athlete_id = ? AND team_id = ?").all(coachId, athleteId, team.id) as { plan_id: string }[];
      const ids = new Set(assignments.map(a => a.plan_id)), plans = this.accounts.planning(athleteId).plans.filter(p => ids.has(p.id) && p.date >= from && p.date <= to);
      const sessions = this.accounts.workspace(athleteId).records.map(r => r.session), completed = new Set(sessions.map(s => s.plannedWorkoutId)), today = athleteToday(user.timezone);
      return { ...row, allowed: true, scheduled: plans.length, completed: plans.filter(p => completed.has(p.id)).length, missed: plans.filter(p => !completed.has(p.id) && p.date < today).length, upcoming: plans.filter(p => !completed.has(p.id) && p.date >= today).length };
    });
  }
  feedbackRow(row: FeedbackRow): Feedback { return { id: row.id, athleteId: row.athlete_id, coachId: row.coach_id, sessionId: row.session_id, authorId: row.author_id, authorName: this.accounts.user(row.author_id).name, body: row.body, replyTo: row.reply_to, createdAt: row.created_at }; }
  feedback(actorId: string, athleteId: string, sessionId: string): Feedback[] {
    if (actorId !== athleteId) this.permission(actorId, athleteId, "sessions", "feedback");
    else this.accounts.user(actorId);
    this.accounts.activeRecord(athleteId, sessionId);
    const rows = (actorId === athleteId ? this.accounts.db.prepare("SELECT * FROM coach_feedback WHERE athlete_id = ? AND session_id = ? ORDER BY created_at, rowid").all(athleteId, sessionId) : this.accounts.db.prepare("SELECT * FROM coach_feedback WHERE athlete_id = ? AND session_id = ? AND coach_id = ? ORDER BY created_at, rowid").all(athleteId, sessionId, actorId)) as FeedbackRow[];
    return rows.map(row => this.feedbackRow(row));
  }
  comment(actorId: string, value: z.input<typeof commentSchema>) {
    const input = commentSchema.parse(value); this.accounts.activeRecord(input.athleteId, input.sessionId);
    let coachId = actorId;
    if (actorId === input.athleteId) {
      if (!input.replyTo) throw new ServiceError("Choose a coach comment to reply to.", 422);
      const parent = this.accounts.db.prepare("SELECT * FROM coach_feedback WHERE id = ? AND athlete_id = ? AND session_id = ? AND reply_to IS NULL").get(input.replyTo, actorId, input.sessionId) as FeedbackRow | undefined;
      if (!parent) throw new ServiceError("Coach comment not found.", 404); coachId = parent.coach_id;
      this.permission(coachId, actorId, "sessions", "feedback");
    } else {
      this.permission(actorId, input.athleteId, "sessions", "feedback");
      if (input.replyTo) {
        const parent = this.accounts.db.prepare("SELECT 1 FROM coach_feedback WHERE id = ? AND athlete_id = ? AND session_id = ? AND coach_id = ? AND reply_to IS NULL").get(input.replyTo, input.athleteId, input.sessionId, actorId);
        if (!parent) throw new ServiceError("Coach comment not found.", 404);
      }
    }
    const count = this.accounts.db.prepare("SELECT count(*) AS n FROM coach_feedback WHERE athlete_id = ? AND session_id = ?").get(input.athleteId, input.sessionId) as { n: number };
    if (count.n >= 500) throw new ServiceError("This session's feedback limit is 500 messages.", 422);
    this.accounts.throttle("coach-feedback:" + actorId, 60);
    this.accounts.db.prepare("INSERT INTO coach_feedback VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), input.athleteId, coachId, input.sessionId, actorId, input.body, input.replyTo, new Date().toISOString());
    return this.feedback(actorId, input.athleteId, input.sessionId);
  }
  createReport(userId: string, value: z.input<typeof reportSchema>) {
    const input = reportSchema.parse(value), user = this.accounts.user(userId);
    if (input.to > athleteToday(user.timezone)) throw new ServiceError("Reports can include completed dates through today.", 422);
    const count = this.accounts.db.prepare("SELECT count(*) AS n FROM progress_reports WHERE user_id = ? AND revoked = 0 AND expires > ?").get(userId, Date.now()) as { n: number };
    if (count.n >= 100) throw new ServiceError("Revoke older reports before adding more.", 422);
    const id = randomUUID(), token = randomBytes(32).toString("hex"), expires = Date.now() + input.expiresDays * 86400_000;
    const snapshot = buildProgressReport(input.title, user.name, input.from, input.to, this.accounts.workspace(userId).records.map(r => r.session), new Date().toISOString());
    this.accounts.db.prepare("INSERT INTO progress_reports (id, user_id, token_hash, data, expires) VALUES (?, ?, ?, ?, ?)").run(id, userId, digest(token), JSON.stringify(snapshot), expires);
    return { id, token, expiresAt: new Date(expires).toISOString(), snapshot };
  }
  revokeReport(userId: string, id: string) {
    this.accounts.user(userId); const result = this.accounts.db.prepare("UPDATE progress_reports SET revoked = 1 WHERE id = ? AND user_id = ?").run(id, userId);
    if (!result.changes) throw new ServiceError("Report not found.", 404);
  }
  report(token: string): ProgressReport {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new ServiceError("Report not found.", 404);
    const row = this.accounts.db.prepare("SELECT data FROM progress_reports WHERE token_hash = ? AND revoked = 0 AND expires > ?").get(digest(token), Date.now()) as { data: string } | undefined;
    if (!row) throw new ServiceError("Report not found.", 404); return JSON.parse(row.data);
  }
  state(userId: string): CoachingState {
    const user = this.accounts.user(userId), coach = user.role === "coach";
    const connectionRows = (coach ? this.accounts.db.prepare("SELECT coach_id, athlete_id, permissions FROM coach_connections WHERE coach_id = ?").all(userId) : this.accounts.db.prepare("SELECT coach_id, athlete_id, permissions FROM coach_connections WHERE athlete_id = ?").all(userId)) as { coach_id: string; athlete_id: string; permissions: string }[];
    const connections = connectionRows.map(row => { const other = this.accounts.user(coach ? row.athlete_id : row.coach_id); return { coachId: row.coach_id, athleteId: row.athlete_id, name: other.name, sport: other.sport, permissions: coachPermissionsSchema.parse(JSON.parse(row.permissions)) }; });
    const teamRows = (coach ? this.accounts.db.prepare("SELECT * FROM coach_teams WHERE coach_id = ?").all(userId) : this.accounts.db.prepare("SELECT t.* FROM coach_teams t JOIN coach_members m ON m.team_id = t.id JOIN coach_connections c ON c.coach_id = t.coach_id AND c.athlete_id = m.athlete_id WHERE m.athlete_id = ?").all(userId)) as TeamRow[];
    const teams: TeamView[] = teamRows.map(team => {
      const rows = (coach ? this.accounts.db.prepare("SELECT m.athlete_id FROM coach_members m JOIN coach_connections c ON c.coach_id = ? AND c.athlete_id = m.athlete_id WHERE m.team_id = ?").all(userId, team.id) : [{ athlete_id: userId }]) as { athlete_id: string }[];
      const templates = this.accounts.db.prepare("SELECT data FROM coach_templates WHERE team_id = ? ORDER BY rowid").all(team.id) as { data: string }[];
      return { id: team.id, name: team.name, coachId: team.coach_id, coachName: this.accounts.user(team.coach_id).name, members: rows.map(row => { const member = this.accounts.user(row.athlete_id); return { id: member.id, name: member.name, sport: member.sport }; }), templates: templatesSchema.parse(templates.map(t => JSON.parse(t.data))) };
    });
    const invitations = coach ? (this.accounts.db.prepare("SELECT i.*, t.name AS team_name FROM coach_invitations i JOIN coach_teams t ON t.id = i.team_id WHERE i.coach_id = ? ORDER BY i.rowid DESC LIMIT 200").all(userId) as (InvitationRow & { team_name: string })[]).map(row => ({ id: row.id, email: row.email, teamName: row.team_name, expiresAt: new Date(row.expires).toISOString(), status: row.revoked ? "Revoked" : row.accepted_at ? "Accepted" : row.expires <= Date.now() ? "Expired" : "Pending" })) : [];
    const reports = (this.accounts.db.prepare("SELECT id, data, expires, revoked FROM progress_reports WHERE user_id = ? ORDER BY rowid DESC").all(userId) as { id: string; data: string; expires: number; revoked: number }[]).map(row => { const snapshot = JSON.parse(row.data) as ProgressReport; return { id: row.id, title: snapshot.title, from: snapshot.from, to: snapshot.to, expiresAt: new Date(row.expires).toISOString(), revoked: !!row.revoked }; });
    const assignments = (this.accounts.db.prepare("SELECT a.plan_id, a.coach_id, t.name AS team_name FROM coach_assignments a LEFT JOIN coach_teams t ON t.id = a.team_id WHERE a.athlete_id = ?").all(userId) as { plan_id: string; coach_id: string; team_name: string | null }[]).map(row => ({ planId: row.plan_id, coachName: this.accounts.user(row.coach_id).name, teamName: row.team_name ?? "Former team" }));
    return { connections, teams, invitations, reports, assignments };
  }
  export(userId: string) {
    const state = this.state(userId), rows = this.accounts.db.prepare("SELECT * FROM coach_feedback WHERE athlete_id = ? OR coach_id = ? ORDER BY created_at").all(userId, userId) as FeedbackRow[];
    const snapshots = this.accounts.db.prepare("SELECT data FROM progress_reports WHERE user_id = ? ORDER BY rowid").all(userId) as { data: string }[];
    const visible = rows.filter(row => {
      if (row.athlete_id === userId) return true;
      try { this.permission(userId, row.athlete_id, "sessions", "feedback"); return true; } catch { return false; }
    });
    return { ...state, feedback: visible.map(row => this.feedbackRow(row)), reportSnapshots: snapshots.map(row => JSON.parse(row.data)) };
  }
}
