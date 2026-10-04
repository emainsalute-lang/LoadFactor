import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountStore, matchesPassword, passwordHash } from "./store";
import { emptyFilter } from "../history";
import { registerSchema, profileSchema } from "../account-validation";
import { athleteToday } from "../account-types";
import { sessionInputSchema, sessionSchemaFor } from "../validation";
import { blockPlans, emptyPlanning, type Planning } from "../planning";
import { wellnessSchemaFor } from "../wellness";
import { randomUUID } from "node:crypto";
let directory: string, store: AccountStore;
const password = "a-long-private-passphrase";
const profile = { name: "Athlete", sport: "Track", timezone: "Africa/Tripoli", weightUnit: "kg" as const, heightUnit: "cm" as const };
const input = sessionInputSchema.parse({ title: "Strength", date: "2026-09-28", exercises: [{ exerciseId: "trap-bar-deadlift", weightKg: 100, reps: 5, jumpHeightCm: null, splitTimeSeconds: null, rpe: 7 }] });
function user(email = "athlete@example.test") { return store.register(registerSchema.parse({ ...profile, email, password })); }
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "loadfactor-test-")); store = new AccountStore(join(directory, "test.sqlite")); });
afterEach(() => { store.close(); if (!directory.startsWith(join(tmpdir(), "loadfactor-test-"))) throw new Error("Unexpected test directory"); rmSync(directory, { recursive: true, force: true }); });
describe("accounts and persistence", () => {
  it("issues scoped, revocable integration tokens and idempotently syncs offline sessions", () => {
    const athlete = user(), id = randomUUID(), token = store.createIntegrationToken(athlete.user.id, "Training export", ["read", "write"]);
    expect(store.integrationUser(token.token, "read").id).toBe(athlete.user.id);
    expect(JSON.stringify(store.db.prepare("SELECT * FROM integration_tokens").all())).not.toContain(token.token);
    const saved = store.syncOfflineSession(athlete.user.id, id, input);
    expect(store.syncOfflineSession(athlete.user.id, id, input).record.session.id).toBe(saved.record.session.id);
    expect(store.integrationTokens(athlete.user.id)).toHaveLength(1);
    store.revokeIntegrationToken(athlete.user.id, token.id);
    expect(() => store.integrationUser(token.token, "read")).toThrow("valid integration token");
    const collisionId = randomUUID(), original = store.canonical(athlete.user.id, input, collisionId);
    store.db.prepare("INSERT INTO workouts (id, user_id, data) VALUES (?, ?, ?)").run(collisionId, athlete.user.id, JSON.stringify(original));
    const conflict = store.syncOfflineSession(athlete.user.id, collisionId, { ...input, title: "Offline replacement" });
    expect(conflict.conflict).toBe(true);
    expect(conflict.record.session.title).toBe(original.session.title);
    expect(store.syncOfflineSession(athlete.user.id, collisionId, { ...input, title: "Offline replacement" }, "local").record.session.title).toBe("Offline replacement");
  });
  it("scopes daily check-ins, updates one date, and preserves wellness and session load across restore", () => {
    const a = user(), b = user("wellness-other@example.test");
    const entry = wellnessSchemaFor(() => "2026-10-04").parse({ date: "2026-09-28", sleepHours: 7.5, sleepQuality: 4, soreness: 2, stress: 3, mood: 4, muscleSoreness: { quads: 3 }, bodyweightKg: 79 });
    store.saveWellness(a.user.id, entry); store.saveWellness(a.user.id, { ...entry, sleepHours: 8 });
    expect(store.wellness(a.user.id)).toHaveLength(1); expect(store.wellness(a.user.id)[0].sleepHours).toBe(8);
    expect(store.wellness(b.user.id)).toEqual([]);
    store.deleteWellness(b.user.id, entry.date); expect(store.wellness(a.user.id)).toHaveLength(1);
    const record = store.save(a.user.id, { ...input, durationMinutes: 60, sessionRpe: 7 });
    expect(record.session.sessionLoad).toBe(420); expect(record.session.averageRpe).toBe(7);
    store.backup(a.user.id, true); const snapshot = store.backups(a.user.id)[0];
    store.deleteWellness(a.user.id, entry.date); store.save(a.user.id, { ...input, durationMinutes: 30, sessionRpe: 2 }, record.session.id);
    store.restore(a.user.id, snapshot.id); store.close(); store = new AccountStore(join(directory, "test.sqlite"));
    expect(store.wellness(a.user.id)[0]).toMatchObject({ sleepHours: 8, bodyweightKg: 79, muscleSoreness: { quads: 3 } });
    expect(store.workspace(a.user.id).wellness).toHaveLength(1); expect(store.activeRecord(a.user.id, record.session.id).session.sessionLoad).toBe(420);
    expect(store.user(a.user.id).bodyweightKg).not.toBe(79);
    expect(() => store.saveWellness(a.user.id, { ...entry, date: "2999-01-01" })).toThrow("future");
    store.deleteAccount(a.user.id, password); expect(store.db.prepare("SELECT * FROM wellness WHERE user_id = ?").get(a.user.id)).toBeUndefined();
  });
  it("restores older snapshots without wellness or session-level effort data", () => {
    const a = user(), record = store.save(a.user.id, input); store.backup(a.user.id, true);
    const snapshot = store.backups(a.user.id)[0], path = join(store.backupRoot, a.user.id, snapshot.id);
    const value = JSON.parse(readFileSync(path, "utf8")); delete value.workspace.wellness;
    for (const entry of value.workspace.records) { delete entry.session.durationMinutes; delete entry.session.sessionRpe; delete entry.session.sessionLoad; }
    writeFileSync(path, JSON.stringify(value)); store.restore(a.user.id, snapshot.id);
    expect(store.wellness(a.user.id)).toEqual([]);
    expect(store.activeRecord(a.user.id, record.session.id).session).toMatchObject({ durationMinutes: null, sessionRpe: null, sessionLoad: null });
  });
  it("isolates planning, scopes completion links, and restores planning with its workouts", () => {
    const a = user(), b = user("planner-other@example.test");
    const block: Planning["blocks"][number] = { id: "b", name: "Build", start: "2026-09-28", weeks: 2, rule: { mode: "load", increment: 5, deloadEvery: 0, deloadPercent: 30 } };
    let n = 0; const plans = blockPlans(input, "Strength", block, [1], () => "p" + ++n);
    const planning: Planning = { ...emptyPlanning, blocks: [block], plans };
    store.savePlanning(a.user.id, planning);
    expect(store.planning(b.user.id)).toEqual(emptyPlanning);
    expect(() => store.save(b.user.id, { ...input, plannedWorkoutId: plans[0].id })).toThrow("not found");
    const record = store.save(a.user.id, { ...input, plannedWorkoutId: plans[0].id });
    expect(() => store.save(a.user.id, { ...input, plannedWorkoutId: plans[0].id })).toThrow("already has");
    expect(() => store.savePlanning(a.user.id, emptyPlanning)).toThrow("Unlink");
    store.backup(a.user.id, true); const snapshot = store.backups(a.user.id)[0];
    store.save(a.user.id, { ...input, plannedWorkoutId: null }, record.session.id);
    store.savePlanning(a.user.id, emptyPlanning);
    store.restore(a.user.id, snapshot.id); store.close(); store = new AccountStore(join(directory, "test.sqlite"));
    expect(store.planning(a.user.id)).toEqual(planning);
    expect(store.activeRecord(a.user.id, record.session.id).session.plannedWorkoutId).toBe(plans[0].id);
    expect(store.workspace(a.user.id).planning).toEqual(planning);
    store.deleteAccount(a.user.id, password);
    expect(store.db.prepare("SELECT * FROM training_planning WHERE user_id = ?").get(a.user.id)).toBeUndefined();
  });
  it("persists test protocols, splits and jump variants through reopen and backup restore", () => {
    const a = user();
    const test = { jumpCategory: "countermovement", approach: "standing", leg: "left", broadJumpCm: null, distanceM: 30, splits: [{ distanceM: 10, seconds: 2 }], protocol: "Electronic timing / track" };
    const sprint = sessionInputSchema.parse({ title: "Sprint tests", date: "2026-09-28", exercises: [{ exerciseId: "sprint-test", weightKg: 0, reps: 1, jumpHeightCm: null, splitTimeSeconds: 5, rpe: 7, test }] });
    const record = store.save(a.user.id, sprint); store.backup(a.user.id, true); const snapshot = store.backups(a.user.id)[0];
    store.save(a.user.id, { ...sprint, title: "Changed" }, record.session.id);
    store.restore(a.user.id, snapshot.id); store.close(); store = new AccountStore(join(directory, "test.sqlite"));
    expect(store.activeRecord(a.user.id, record.session.id).session.exercises[0].test).toEqual(test);
    expect(store.activeRecord(a.user.id, record.session.id).session.title).toBe("Sprint tests");
  });
  it("hashes credentials, supports login and rejects duplicate or invalid registrations", () => {
    const hash = passwordHash(password); expect(hash).not.toContain(password); expect(matchesPassword(password, hash)).toBe(true); expect(matchesPassword("wrong", hash)).toBe(false);
    const created = user(); expect(store.login(created.user.email, password).id).toBe(created.user.id);
    expect(() => store.login(created.user.email, "wrong")).toThrow("incorrect");
    expect(() => user()).toThrow("already has an account");
    expect(registerSchema.safeParse({ ...profile, email: "bad", password: "short" }).success).toBe(false);
  });
  it("revokes sign-ins and rotates the recovery code when resetting a password", () => {
    const created = user(), token = store.issueToken(created.user.id);
    expect(store.authenticate(token)?.id).toBe(created.user.id);
    expect(() => store.recover(created.user.email, "incorrect", password)).toThrow("incorrect");
    const recovered = store.recover(created.user.email, created.recoveryCode, "a-new-private-passphrase");
    expect(store.authenticate(token)).toBeNull(); expect(recovered.recoveryCode).not.toBe(created.recoveryCode);
    expect(() => store.recover(created.user.email, created.recoveryCode, password)).toThrow("incorrect");
    expect(store.login(created.user.email, "a-new-private-passphrase").id).toBe(created.user.id);
    const nextToken = store.issueToken(created.user.id); store.revoke(nextToken); expect(store.authenticate(nextToken)).toBeNull();
  });
  it("persists records across database reopen and assigns ownership on the server", () => {
    const created = user(), record = store.save(created.user.id, input);
    expect(record.session.userId).toBe(created.user.id); expect(record.session.volumeKg).toBe(500);
    store.close(); store = new AccountStore(join(directory, "test.sqlite"));
    expect(store.workspace(created.user.id).records[0].session.id).toBe(record.session.id);
    const edited = store.save(created.user.id, { ...input, exercises: [{ ...input.exercises[0], reps: 3 }] }, record.session.id);
    expect(edited.session.volumeKg).toBe(300); expect(edited.session.createdAt).toBe(record.session.createdAt);
  });
  it("isolates records, edits, deletion, restores, backups and assets by account", () => {
    const a = user(), b = user("other@example.test"); const record = store.save(a.user.id, input);
    expect(store.workspace(b.user.id).records).toEqual([]);
    expect(() => store.save(b.user.id, input, record.session.id)).toThrow("not found");
    expect(() => store.setDeleted(b.user.id, record.session.id, true)).toThrow("not found");
    expect(() => store.restore(b.user.id, store.backups(a.user.id)[0].id)).toThrow("not found");
    store.setDeleted(a.user.id, record.session.id, true); expect(store.workspace(a.user.id).records).toEqual([]);
    store.setDeleted(a.user.id, record.session.id, false); expect(store.workspace(a.user.id).records).toHaveLength(1);
  });
  it("imports idempotently and rolls back an entire invalid batch", () => {
    const a = user(); const entries = [{ migrationId: "local-record", input }];
    expect(store.importRecords(a.user.id, entries)).toBe(1); expect(store.importRecords(a.user.id, entries)).toBe(0);
    expect(() => store.importRecords(a.user.id, [{ migrationId: "new-valid", input }, { migrationId: "future", input: { ...input, date: "2999-01-01" } }])).toThrow("future");
    expect(store.workspace(a.user.id).records).toHaveLength(1);
  });
  it("keeps import history when restoring a snapshot predating an import", () => {
    const a = user(); store.backup(a.user.id, true); const snapshot = store.backups(a.user.id)[0];
    const entries = [{ migrationId: "original", input }];
    expect(store.importRecords(a.user.id, entries)).toBe(1);
    store.restore(a.user.id, snapshot.id);
    expect(store.workspace(a.user.id).records).toHaveLength(0);
    expect(store.importRecords(a.user.id, entries)).toBe(0);
  });
  it("preserves tags and scopes saved filters across backups and account removal", () => {
    const a = user(), b = user("another@example.test");
    const tagged = store.save(a.user.id, { ...input, tags: ["power"] });
    expect(store.activeRecord(a.user.id, tagged.session.id).session.tags).toEqual(["power"]);
    expect(() => store.activeRecord(b.user.id, tagged.session.id)).toThrow("not found");
    const filters = [{ id: "strength", name: "Strength", filter: { ...emptyFilter, category: "strength" as const } }];
    store.saveFilters(a.user.id, filters); expect(store.filters(b.user.id)).toEqual([]);
    store.backup(a.user.id, true); const snapshot = store.backups(a.user.id)[0];
    store.saveFilters(a.user.id, []); store.restore(a.user.id, snapshot.id);
    expect(store.filters(a.user.id)).toEqual(filters);
    expect(store.workspace(a.user.id).savedFilters).toEqual(filters);
    store.setDeleted(a.user.id, tagged.session.id, true);
    expect(() => store.activeRecord(a.user.id, tagged.session.id)).toThrow("not found");
    store.deleteAccount(a.user.id, password);
    expect(store.db.prepare("SELECT * FROM history_filters WHERE user_id = ?").get(a.user.id)).toBeUndefined();
  });
  it("persists strength details, bodyweight and settings through backup while keeping accounts isolated", () => {
    const a = user(), b = user("strength-other@example.test");
    const parsed = sessionInputSchema.parse({ ...input, bodyweightKg: 80, exercises: [{ ...input.exercises[0], tempo: "3-1-X-0", pauseSeconds: 2 }] });
    const record = store.save(a.user.id, parsed);
    const settings = { muscles: { "trap-bar-deadlift": ["glutes" as const] }, alternatives: { "trap-bar-deadlift": ["romanian-deadlift"] } };
    store.saveStrengthSettings(a.user.id, settings); expect(store.strengthSettings(b.user.id)).toEqual({ muscles: {}, alternatives: {} });
    expect(() => store.saveStrengthSettings(a.user.id, { muscles: {}, alternatives: { "trap-bar-deadlift": ["10m-fly"] } })).toThrow("known strength");
    store.backup(a.user.id, true); const snapshot = store.backups(a.user.id)[0];
    store.saveStrengthSettings(a.user.id, { muscles: {}, alternatives: {} }); store.restore(a.user.id, snapshot.id);
    expect(store.strengthSettings(a.user.id)).toEqual(settings);
    expect(store.activeRecord(a.user.id, record.session.id).session).toMatchObject({ bodyweightKg: 80, exercises: [expect.objectContaining({ tempo: "3-1-X-0", pauseSeconds: 2 })] });
    store.deleteAccount(a.user.id, password); expect(store.db.prepare("SELECT * FROM strength_settings WHERE user_id = ?").get(a.user.id)).toBeUndefined();
  });
  it("rejects expired sessions", () => {
    const a = user(), token = store.issueToken(a.user.id);
    store.db.prepare("UPDATE auth_sessions SET expires = 0 WHERE user_id = ?").run(a.user.id);
    expect(store.authenticate(token)).toBeNull();
  });
  it("restores workouts and templates from snapshots and removes recoverable account copies", () => {
    const a = user(), b = user("other@example.test"); const record = store.save(a.user.id, input);
    store.saveAssets(a.user.id, { custom: [], templates: [{ id: "template", name: "Strength", input }] });
    store.backup(a.user.id, true); const snapshot = store.backups(a.user.id)[0];
    store.setDeleted(a.user.id, record.session.id, true); store.saveAssets(a.user.id, { custom: [], templates: [] });
    store.restore(a.user.id, snapshot.id);
    expect(store.workspace(a.user.id).records).toHaveLength(1); expect(store.workspace(a.user.id).templates).toHaveLength(1);
    expect(() => store.restore(a.user.id, "../other.json")).toThrow("not found");
    expect(() => store.deleteAccount(a.user.id, "wrong")).toThrow("incorrect");
    store.deleteAccount(a.user.id, password);
    expect(() => store.user(a.user.id)).toThrow("Sign in"); expect(existsSync(join(directory, "backups", a.user.id))).toBe(false);
    expect(store.user(b.user.id).email).toBe(b.user.email);
  });
  it("uses athlete timezones at date boundaries and persists profile preferences", () => {
    const now = new Date("2026-10-04T23:30:00Z");
    expect(athleteToday("Africa/Tripoli", now)).toBe("2026-10-05"); expect(athleteToday("America/Los_Angeles", now)).toBe("2026-10-04");
    expect(sessionSchemaFor(() => "2026-10-05").safeParse({ ...input, date: "2026-10-05" }).success).toBe(true);
    expect(sessionSchemaFor(() => "2026-10-04").safeParse({ ...input, date: "2026-10-05" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, timezone: "not-a-timezone" }).success).toBe(false);
    const a = user(); expect(store.profile(a.user.id, { ...profile, name: "New name", weightUnit: "lbs" }).weightUnit).toBe("lbs");
  });
  it("bounds repeated credential attempts", () => {
    for (let index = 0; index < 10; index++) expect(() => store.login("missing@example.test", "wrong")).toThrow("incorrect");
    expect(() => store.login("missing@example.test", "wrong")).toThrow("Too many attempts");
  });
});
