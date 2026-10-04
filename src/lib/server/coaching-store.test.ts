import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountStore } from "./store";
import { CoachingStore } from "./coaching-store";
import { noCoachPermissions, type CoachPermissions } from "../coaching";
import { sessionInputSchema } from "../validation";
import { athleteToday } from "../account-types";
import { shiftDate } from "../planning";
let directory: string, accounts: AccountStore, coaching: CoachingStore, sequence: number;
const password = "a-private-test-passphrase", profile = { name: "Athlete", sport: "Track", timezone: "Africa/Tripoli", weightUnit: "kg" as const, heightUnit: "cm" as const };
const allPermissions: CoachPermissions = { sessions: true, wellness: true, planning: true, assignPlans: true, feedback: true };
const input = sessionInputSchema.parse({ title: "Training", date: "2026-09-28", notes: "PRIVATE SESSION NOTES", bodyweightKg: 80, durationMinutes: 60, sessionRpe: 7, exercises: [{ exerciseId: "trap-bar-deadlift", weightKg: 100, reps: 5, jumpHeightCm: null, splitTimeSeconds: null, rpe: 8 }] });
function user(role: "athlete" | "coach" = "athlete") { return accounts.register({ ...profile, role, name: role + ++sequence, email: role + sequence + "@example.test", password }).user; }
function connect(coachId: string, athleteId: string, permissions = noCoachPermissions, teamId?: string) {
  const team = teamId ?? coaching.createTeam(coachId, "Track team").id;
  const invitation = coaching.invite(coachId, { teamId: team, email: accounts.user(athleteId).email });
  coaching.accept(athleteId, { code: invitation.code, permissions }); return { team, invitation };
}
function teamTemplate(coachId: string, teamId: string) {
  accounts.saveAssets(coachId, { custom: [], templates: [{ id: "personal", name: "Team workout", input }] });
  return coaching.shareTemplate(coachId, teamId, "personal");
}
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "loadfactor-coach-")); accounts = new AccountStore(join(directory, "test.sqlite")); coaching = new CoachingStore(accounts); sequence = 0; });
afterEach(() => { accounts.close(); if (!directory.startsWith(join(tmpdir(), "loadfactor-coach-"))) throw new Error("Unexpected test directory"); rmSync(directory, { recursive: true, force: true }); });
describe("coaching access and teams", () => {
  it("preserves coach roles and denies coach capabilities to athlete accounts", () => {
    const coach = user("coach"), athlete = user(); expect(coach.role).toBe("coach");
    expect(() => coaching.createTeam(athlete.id, "Unauthorized")).toThrow("coach account");
    accounts.profile(coach.id, { ...profile, name: "Renamed" }); expect(accounts.user(coach.id).role).toBe("coach");
    expect(() => coaching.createTeam(coach.id, " ")).toThrow();
  });
  it("binds invitation codes to the athlete email and makes them single-use without storing plaintext", () => {
    const coach = user("coach"), athlete = user(), outsider = user(), team = coaching.createTeam(coach.id, "Team");
    const invitation = coaching.invite(coach.id, { teamId: team.id, email: athlete.email.toUpperCase() });
    expect(JSON.stringify(accounts.db.prepare("SELECT * FROM coach_invitations").all())).not.toContain(invitation.code);
    expect(() => coaching.accept(outsider.id, { code: invitation.code, permissions: allPermissions })).toThrow("another account");
    expect(() => coaching.previewInvitation(outsider.id, invitation.code)).toThrow("another account");
    expect(coaching.previewInvitation(athlete.id, invitation.code)).toMatchObject({ coachName: coach.name, teamName: team.name });
    const state = coaching.accept(athlete.id, { code: invitation.code, permissions: noCoachPermissions });
    expect(state.connections[0].permissions).toEqual(noCoachPermissions);
    expect(() => coaching.accept(athlete.id, { code: invitation.code, permissions: allPermissions })).toThrow("used");
    expect(coaching.state(coach.id).teams[0].members[0].id).toBe(athlete.id);
  });
  it("rejects expired and revoked invitations and prevents another coach from managing teams or invitations", () => {
    const coach = user("coach"), other = user("coach"), athlete = user(), team = coaching.createTeam(coach.id, "Team");
    const first = coaching.invite(coach.id, { teamId: team.id, email: athlete.email }); coaching.revokeInvitation(coach.id, first.id);
    expect(() => coaching.accept(athlete.id, { code: first.code, permissions: allPermissions })).toThrow("invalid");
    const expired = coaching.invite(coach.id, { teamId: team.id, email: athlete.email }); accounts.db.prepare("UPDATE coach_invitations SET expires = 1 WHERE id = ?").run(expired.id);
    expect(() => coaching.accept(athlete.id, { code: expired.code, permissions: allPermissions })).toThrow("expired");
    expect(() => coaching.deleteTeam(other.id, team.id)).toThrow("not found"); expect(() => coaching.revokeInvitation(other.id, first.id)).toThrow("not found");
  });
  it("returns only permitted data and allows only the athlete to change their connection", () => {
    const coach = user("coach"), athlete = user(), outsider = user(); connect(coach.id, athlete.id);
    accounts.save(athlete.id, input);
    accounts.saveWellness(athlete.id, { date: "2026-09-28", sleepHours: 8, sleepQuality: null, soreness: null, stress: null, mood: null, bodyweightKg: null, muscleSoreness: {}, notes: "PRIVATE WELLNESS" });
    const view = coaching.athleteView(coach.id, athlete.id); expect(view.sessions).toBeUndefined(); expect(view.wellness).toBeUndefined(); expect(view.planning).toBeUndefined();
    expect(() => coaching.setPermissions(outsider.id, coach.id, allPermissions)).toThrow("not found");
    coaching.setPermissions(athlete.id, coach.id, { ...noCoachPermissions, sessions: true });
    expect(coaching.athleteView(coach.id, athlete.id).sessions).toHaveLength(1); expect(coaching.athleteView(coach.id, athlete.id).wellness).toBeUndefined();
    coaching.setPermissions(athlete.id, coach.id, { ...noCoachPermissions, wellness: true });
    expect(coaching.athleteView(coach.id, athlete.id).wellness).toHaveLength(1); expect(coaching.athleteView(coach.id, athlete.id).sessions).toBeUndefined();
  });
  it("keeps existing permissions when joining another team and hides other athletes from athlete rosters", () => {
    const coach = user("coach"), a = user(), b = user(), first = connect(coach.id, a.id, noCoachPermissions);
    connect(coach.id, b.id, allPermissions, first.team);
    const second = connect(coach.id, a.id, allPermissions); expect(coaching.state(a.id).connections[0].permissions).toEqual(noCoachPermissions);
    expect(coaching.state(a.id).teams.find(t => t.id === first.team)?.members.map(m => m.id)).toEqual([a.id]);
    coaching.member(coach.id, second.team, b.id, true); expect(coaching.state(coach.id).teams.find(t => t.id === second.team)?.members).toHaveLength(2);
    coaching.member(coach.id, second.team, b.id, false); expect(coaching.state(coach.id).teams.find(t => t.id === second.team)?.members).toHaveLength(1);
  });
  it("copies shared templates into a connected member's workspace and blocks copying after disconnect", () => {
    const coach = user("coach"), athlete = user(), outsider = user(), { team } = connect(coach.id, athlete.id);
    const template = teamTemplate(coach.id, team); expect(template.input.durationMinutes).toBeNull(); expect(template.input.sessionRpe).toBeNull(); expect(template.input.bodyweightKg).toBeNull();
    expect(() => coaching.copyTemplate(outsider.id, team, template.id)).toThrow("not available");
    coaching.copyTemplate(athlete.id, team, template.id); expect(accounts.workspace(athlete.id).templates).toHaveLength(1);
    coaching.disconnect(athlete.id, coach.id); expect(coaching.state(coach.id).teams[0].members).toEqual([]);
    expect(() => coaching.copyTemplate(athlete.id, team, template.id)).toThrow("not available"); expect(() => coaching.athleteView(coach.id, athlete.id)).toThrow("connection");
    expect(accounts.workspace(athlete.id).templates).toHaveLength(1);
  });
  it("requires assignment consent for every selected athlete and saves the batch atomically", () => {
    const coach = user("coach"), a = user(), b = user(), { team } = connect(coach.id, a.id, allPermissions); connect(coach.id, b.id, noCoachPermissions, team);
    const template = teamTemplate(coach.id, team), start = shiftDate(athleteToday(profile.timezone), 1);
    const request = { teamId: team, templateId: template.id, athleteIds: [a.id, b.id], start, weeks: 2, weekdays: [1, 3] };
    expect(() => coaching.assign(coach.id, request)).toThrow("permission"); expect(accounts.planning(a.id).plans).toHaveLength(0);
    coaching.setPermissions(b.id, coach.id, { ...noCoachPermissions, assignPlans: true });
    expect(coaching.assign(coach.id, request)).toEqual({ athletes: 2, workouts: 8 }); expect(accounts.planning(a.id).plans).toHaveLength(4); expect(accounts.planning(b.id).plans).toHaveLength(4);
    expect(accounts.planning(a.id).plans[0].input.exercises[0].weightKg).toBe(100);
    coaching.disconnect(a.id, coach.id); expect(accounts.planning(a.id).plans).toHaveLength(4);
  });
  it("gates completion counts and counts only this team's assignments with active linked workouts", () => {
    const coach = user("coach"), athlete = user(), { team } = connect(coach.id, athlete.id, { ...noCoachPermissions, assignPlans: true });
    const template = teamTemplate(coach.id, team), start = shiftDate(athleteToday(profile.timezone), 1), end = shiftDate(start, 6);
    coaching.assign(coach.id, { teamId: team, templateId: template.id, athleteIds: [athlete.id], start, weeks: 1, weekdays: [0, 1, 2, 3, 4, 5, 6] });
    expect(coaching.completion(coach.id, team, start, end)[0]).toEqual({ athleteId: athlete.id, name: athlete.name, allowed: false });
    coaching.setPermissions(athlete.id, coach.id, allPermissions); const plan = accounts.planning(athlete.id).plans[0];
    const workout = accounts.save(athlete.id, { ...input, plannedWorkoutId: plan.id });
    expect(coaching.completion(coach.id, team, start, end)[0]).toMatchObject({ scheduled: 7, completed: 1, upcoming: 6 });
    accounts.setDeleted(athlete.id, workout.session.id, true); expect(coaching.completion(coach.id, team, start, end)[0].completed).toBe(0);
  });
  it("supports coach threads and athlete replies without cross-session or cross-coach access", () => {
    const coach = user("coach"), other = user("coach"), athlete = user(); connect(coach.id, athlete.id, allPermissions); connect(other.id, athlete.id, allPermissions);
    const first = accounts.save(athlete.id, input), second = accounts.save(athlete.id, input);
    const root = coaching.comment(coach.id, { athleteId: athlete.id, sessionId: first.session.id, body: "Keep your technique consistent" })[0];
    coaching.comment(athlete.id, { athleteId: athlete.id, sessionId: first.session.id, body: "I will", replyTo: root.id });
    expect(coaching.feedback(coach.id, athlete.id, first.session.id)).toHaveLength(2); expect(coaching.feedback(other.id, athlete.id, first.session.id)).toHaveLength(0);
    expect(() => coaching.comment(athlete.id, { athleteId: athlete.id, sessionId: second.session.id, body: "Wrong thread", replyTo: root.id })).toThrow("not found");
    expect(() => coaching.comment(other.id, { athleteId: athlete.id, sessionId: first.session.id, body: "Wrong coach", replyTo: root.id })).toThrow("not found");
    expect(() => coaching.comment(athlete.id, { athleteId: athlete.id, sessionId: first.session.id, body: "No root" })).toThrow("Choose");
    coaching.setPermissions(athlete.id, coach.id, { ...allPermissions, feedback: false });
    expect(() => coaching.feedback(coach.id, athlete.id, first.session.id)).toThrow("permission"); expect(coaching.export(coach.id).feedback).toHaveLength(0);
    expect(coaching.feedback(athlete.id, athlete.id, first.session.id)).toHaveLength(2);
  });
  it("does not revive permissions, disconnected memberships or report tokens when restoring a workout snapshot", () => {
    const coach = user("coach"), athlete = user(); connect(coach.id, athlete.id, allPermissions); accounts.save(athlete.id, input);
    const report = coaching.createReport(athlete.id, { title: "Progress", from: input.date, to: input.date, expiresDays: 30 });
    accounts.backup(athlete.id, true); const snapshot = accounts.backups(athlete.id)[0]; coaching.disconnect(athlete.id, coach.id); coaching.revokeReport(athlete.id, report.id);
    accounts.restore(athlete.id, snapshot.id); expect(() => coaching.athleteView(coach.id, athlete.id)).toThrow("connection"); expect(() => coaching.report(report.token)).toThrow("not found");
    expect(coaching.state(athlete.id).teams).toEqual([]);
  });
});
describe("revocable progress reports", () => {
  it("publishes a scoped snapshot without private notes, wellness, bodyweight, credentials or stored plaintext tokens", () => {
    const athlete = user(); const record = accounts.save(athlete.id, input);
    const report = coaching.createReport(athlete.id, { title: "September", from: input.date, to: input.date, expiresDays: 7 });
    const snapshot = coaching.report(report.token); expect(snapshot.totals).toMatchObject({ sessions: 1, volumeKg: 500, sessionLoad: 420 });
    const serialized = JSON.stringify(snapshot); for (const text of ["PRIVATE SESSION NOTES", "bodyweight", "wellness", "password", athlete.email, record.session.id]) expect(serialized).not.toContain(text);
    expect(JSON.stringify(accounts.db.prepare("SELECT * FROM progress_reports").all())).not.toContain(report.token);
    accounts.save(athlete.id, { ...input, exercises: [{ ...input.exercises[0], weightKg: 200 }] }, record.session.id);
    expect(coaching.report(report.token).totals.volumeKg).toBe(500);
    expect(JSON.stringify(coaching.export(athlete.id))).not.toContain(report.token);
  });
  it("revokes and expires links and prevents other users from revoking them", () => {
    const athlete = user(), other = user(); accounts.save(athlete.id, input);
    const report = coaching.createReport(athlete.id, { title: "Progress", from: input.date, to: input.date, expiresDays: 7 });
    expect(() => coaching.revokeReport(other.id, report.id)).toThrow("not found"); coaching.revokeReport(athlete.id, report.id); expect(() => coaching.report(report.token)).toThrow("not found");
    const expired = coaching.createReport(athlete.id, { title: "Expired", from: input.date, to: input.date, expiresDays: 1 }); accounts.db.prepare("UPDATE progress_reports SET expires = 1 WHERE id = ?").run(expired.id);
    expect(() => coaching.report(expired.token)).toThrow("not found"); expect(() => coaching.report("unknown")).toThrow("not found");
    expect(() => coaching.createReport(athlete.id, { title: "Future", from: "2999-01-01", to: "2999-01-02", expiresDays: 7 })).toThrow("today");
  });
  it("removes account-linked coaching data and report access on account deletion", () => {
    const coach = user("coach"), athlete = user(), { team } = connect(coach.id, athlete.id, allPermissions); const session = accounts.save(athlete.id, input);
    coaching.comment(coach.id, { athleteId: athlete.id, sessionId: session.session.id, body: "Feedback" });
    const report = coaching.createReport(athlete.id, { title: "Report", from: input.date, to: input.date, expiresDays: 7 });
    accounts.deleteAccount(athlete.id, password); expect(() => coaching.report(report.token)).toThrow("not found");
    expect(coaching.state(coach.id).connections).toEqual([]); expect(coaching.state(coach.id).teams.find(t => t.id === team)?.members).toEqual([]);
    expect(accounts.db.prepare("SELECT * FROM coach_feedback").all()).toEqual([]); expect(accounts.db.prepare("SELECT * FROM coach_invitations").all()).toEqual([]);
  });
});
