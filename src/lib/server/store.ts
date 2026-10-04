import { DatabaseSync } from "node:sqlite";
import { planningSchema, emptyPlanning, type Planning } from "../planning";
import { wellnessSchemaFor, wellnessHistorySchema, type WellnessCheckIn } from "../wellness";
import { randomUUID, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, rmSync, existsSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { createSession } from "../sessions";
import { sessionSchemaFor, strengthSettingsSchema, type StrengthSettings, type SessionInput } from "../validation";
import { assetsSchema, profileSchema } from "../account-validation";
import { athleteToday, type AccountUser, type AccountWorkspace } from "../account-types";
import type { SessionSubmission } from "../types";
import { strengthCatalog } from "../strength";
import { savedFiltersSchema, type SavedHistoryFilter } from "../history";
import { z } from "zod";

export class ServiceError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function passwordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function matchesPassword(password: string, hash: string): boolean {
  const [salt, stored] = hash.split(":");
  if (!salt || !stored) return false;
  const actual = scryptSync(password, salt, 64), expected = Buffer.from(stored, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const backupSchema = z.object({ userId: z.string(), createdAt: z.string(), workspace: z.object({
  records: z.array(z.object({ session: sessionSchemaFor(() => "9999-12-31").and(z.object({ id: z.string(), createdAt: z.string() })) })),
  savedFilters: savedFiltersSchema.default([]),
  planning: planningSchema.default(emptyPlanning),
  wellness: wellnessHistorySchema.default([]),
  strengthSettings: strengthSettingsSchema.default({ muscles: {}, alternatives: {} }),
  custom: assetsSchema.shape.custom, templates: assetsSchema.shape.templates,
}) });
type UserRow = { id: string; email: string; password_hash: string; recovery_hash: string; profile: string; created_at: string };
export class AccountStore {
  readonly db: DatabaseSync;
  readonly backupRoot: string;
  constructor(path: string, backupRoot = join(dirname(path), "backups")) {
    if (path !== ":memory:") mkdirSync(dirname(resolve(path)), { recursive: true });
    this.backupRoot = resolve(backupRoot);
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA secure_delete = ON; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL, profile TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS workouts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, migration_id TEXT, UNIQUE(user_id, migration_id));
      CREATE TABLE IF NOT EXISTS imports (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, source_id TEXT NOT NULL, PRIMARY KEY(user_id, source_id));
      CREATE INDEX IF NOT EXISTS workouts_user ON workouts(user_id);
      CREATE TABLE IF NOT EXISTS assets (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history_filters (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS strength_settings (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS training_planning (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS wellness (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(user_id, date));
      CREATE TABLE IF NOT EXISTS integration_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, scopes TEXT NOT NULL, created_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS offline_session_sync (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, client_id TEXT NOT NULL, session_id TEXT NOT NULL, PRIMARY KEY(user_id, client_id));
      CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);`);
  }
  transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const value = action(); this.db.exec("COMMIT"); return value; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  throttle(key: string, limit = 10) {
    const now = Date.now();
    this.db.prepare("DELETE FROM attempts WHERE until < ?").run(now);
    const row = this.db.prepare("SELECT count FROM attempts WHERE key = ?").get(key) as { count: number } | undefined;
    if (row && row.count >= limit) throw new ServiceError("Too many attempts. Try again in 15 minutes.", 429);
    this.db.prepare("INSERT INTO attempts VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1").run(key, now + 15 * 60_000);
  }
  rowByEmail(email: string) { return this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined; }
  publicUser(row: UserRow): AccountUser { const profile = JSON.parse(row.profile); return { ...profile, role: profile.role ?? "athlete", id: row.id, email: row.email, createdAt: row.created_at }; }
  user(id: string): AccountUser {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    if (!row) throw new ServiceError("Sign in to continue.", 401);
    return this.publicUser(row);
  }
  register(input: { email: string; password: string } & z.input<typeof profileSchema>) {
    if (this.rowByEmail(input.email)) throw new ServiceError("This email already has an account. Sign in or use your recovery code.", 409);
    const id = randomUUID(), recoveryCode = randomBytes(24).toString("hex"), createdAt = new Date().toISOString();
    const profile = profileSchema.parse(input);
    this.db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)").run(id, input.email, passwordHash(input.password), digest(recoveryCode), JSON.stringify(profile), createdAt);
    return { user: this.user(id), recoveryCode };
  }
  login(email: string, password: string): AccountUser {
    this.throttle("login:" + digest(email));
    const row = this.rowByEmail(email);
    // Use the same expensive comparison for absent accounts.
    const valid = matchesPassword(password, row?.password_hash ?? "00000000000000000000000000000000:" + "00".repeat(64));
    if (!row || !valid) throw new ServiceError("Email or password is incorrect.", 401);
    this.db.prepare("DELETE FROM attempts WHERE key = ?").run("login:" + digest(email));
    return this.publicUser(row);
  }
  recover(email: string, code: string, password: string) {
    this.throttle("recovery:" + digest(email), 5);
    const row = this.rowByEmail(email);
    const expected = Buffer.from(row?.recovery_hash ?? "00".repeat(32), "hex"), actual = Buffer.from(digest(code), "hex");
    if (!row || !timingSafeEqual(expected, actual)) throw new ServiceError("Email or recovery code is incorrect.", 401);
    const recoveryCode = randomBytes(24).toString("hex");
    this.transaction(() => {
      this.db.prepare("UPDATE users SET password_hash = ?, recovery_hash = ? WHERE id = ?").run(passwordHash(password), digest(recoveryCode), row.id);
      this.db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(row.id);
      this.db.prepare("DELETE FROM attempts WHERE key = ?").run("recovery:" + digest(email));
    });
    return { user: this.user(row.id), recoveryCode };
  }
  issueToken(userId: string) {
    const token = randomBytes(32).toString("hex");
    this.db.prepare("DELETE FROM auth_sessions WHERE expires < ?").run(Date.now());
    this.db.prepare("INSERT INTO auth_sessions VALUES (?, ?, ?)").run(digest(token), userId, Date.now() + 30 * 86400_000);
    return token;
  }
  createIntegrationToken(userId: string, name: string, scopes: ("read" | "write")[]) {
    this.user(userId);
    const parsedName = z.string().trim().min(1).max(80).parse(name);
    const parsedScopes = z.array(z.enum(["read", "write"])).min(1).max(2).refine(values => new Set(values).size === values.length).parse(scopes);
    const count = this.db.prepare("SELECT count(*) AS n FROM integration_tokens WHERE user_id = ? AND revoked = 0").get(userId) as { n: number };
    if (count.n >= 20) throw new ServiceError("Revoke an unused integration token before creating another.", 422);
    const id = randomUUID(), token = "lf_" + randomBytes(32).toString("hex");
    this.db.prepare("INSERT INTO integration_tokens VALUES (?, ?, ?, ?, ?, ?, 0)").run(id, userId, parsedName, digest(token), JSON.stringify(parsedScopes), new Date().toISOString());
    return { id, name: parsedName, token, scopes: parsedScopes, createdAt: new Date().toISOString() };
  }
  integrationTokens(userId: string) {
    this.user(userId);
    return this.db.prepare("SELECT id, name, scopes, created_at AS createdAt, revoked FROM integration_tokens WHERE user_id = ? ORDER BY created_at DESC").all(userId).map(row => {
      const value = row as { id: string; name: string; scopes: string; createdAt: string; revoked: number };
      return { id: value.id, name: value.name, scopes: JSON.parse(value.scopes) as ("read" | "write")[], createdAt: value.createdAt, revoked: !!value.revoked };
    });
  }
  revokeIntegrationToken(userId: string, id: string) {
    const result = this.db.prepare("UPDATE integration_tokens SET revoked = 1 WHERE id = ? AND user_id = ? AND revoked = 0").run(id, userId);
    if (!result.changes) throw new ServiceError("Integration token not found.", 404);
  }
  integrationUser(token: string, scope: "read" | "write") {
    if (!/^lf_[a-f0-9]{64}$/.test(token)) throw new ServiceError("A valid integration token is required.", 401);
    const row = this.db.prepare("SELECT user_id, scopes FROM integration_tokens WHERE token_hash = ? AND revoked = 0").get(digest(token)) as { user_id: string; scopes: string } | undefined;
    if (!row) throw new ServiceError("A valid integration token is required.", 401);
    if (!(JSON.parse(row.scopes) as string[]).includes(scope)) throw new ServiceError("This token is not authorized for this operation.", 403);
    return this.user(row.user_id);
  }
  syncOfflineSession(userId: string, clientId: string, input: SessionInput, resolution?: "server" | "local") {
    this.user(userId);
    if (input.plannedWorkoutId && !this.planning(userId).plans.some(plan => plan.id === input.plannedWorkoutId)) throw new ServiceError("Scheduled workout not found.", 422);
    if (input.plannedWorkoutId && this.workspace(userId).records.some(record => record.session.plannedWorkoutId === input.plannedWorkoutId && record.session.id !== clientId)) throw new ServiceError("This schedule already has a completed workout.", 409);
    const existingSync = this.db.prepare("SELECT session_id FROM offline_session_sync WHERE user_id = ? AND client_id = ?").get(userId, clientId) as { session_id: string } | undefined;
    if (existingSync) return { record: this.activeRecord(userId, existingSync.session_id), conflict: false };
    const collision = this.db.prepare("SELECT id FROM workouts WHERE id = ? AND user_id = ?").get(clientId, userId) as { id: string } | undefined;
    if (collision && !resolution) return { conflict: true, record: this.activeRecord(userId, collision.id) };
    if (collision && resolution === "server") {
      const record = this.activeRecord(userId, collision.id);
      this.db.prepare("INSERT INTO offline_session_sync VALUES (?, ?, ?)").run(userId, clientId, collision.id);
      return { record, conflict: false };
    }
    if (collision) {
      const record = this.save(userId, input, clientId);
      this.db.prepare("INSERT INTO offline_session_sync VALUES (?, ?, ?)").run(userId, clientId, clientId);
      return { record, conflict: false };
    }
    const record = this.canonical(userId, input, clientId);
    this.backup(userId);
    this.transaction(() => {
      this.db.prepare("INSERT INTO workouts (id, user_id, data) VALUES (?, ?, ?)").run(clientId, userId, JSON.stringify(record));
      this.db.prepare("INSERT INTO offline_session_sync VALUES (?, ?, ?)").run(userId, clientId, clientId);
    });
    return { record, conflict: false };
  }
  authenticate(token?: string): AccountUser | null {
    if (!token) return null;
    const row = this.db.prepare("SELECT user_id FROM auth_sessions WHERE token_hash = ? AND expires > ?").get(digest(token), Date.now()) as { user_id: string } | undefined;
    return row ? this.user(row.user_id) : null;
  }
  revoke(token: string) { this.db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(digest(token)); }
  profile(userId: string, input: z.input<typeof profileSchema>) {
    this.db.prepare("UPDATE users SET profile = ? WHERE id = ?").run(JSON.stringify(profileSchema.parse({ ...input, role: input.role ?? this.user(userId).role })), userId);
    return this.user(userId);
  }
  workspace(userId: string): AccountWorkspace {
    this.user(userId);
    const rows = this.db.prepare("SELECT data FROM workouts WHERE user_id = ? AND deleted = 0 ORDER BY rowid").all(userId) as { data: string }[];
    const assets = this.db.prepare("SELECT data FROM assets WHERE user_id = ?").get(userId) as { data: string } | undefined;
    return { wellness: this.wellness(userId), planning: this.planning(userId), strengthSettings: this.strengthSettings(userId), savedFilters: this.filters(userId), records: rows.map(row => JSON.parse(row.data)), ...(assets ? assetsSchema.parse(JSON.parse(assets.data)) : { custom: [], templates: [] }) };
  }
  wellness(userId: string): WellnessCheckIn[] {
    this.user(userId);
    const rows = this.db.prepare("SELECT data FROM wellness WHERE user_id = ? ORDER BY date").all(userId) as { data: string }[];
    return wellnessHistorySchema.parse(rows.map(row => JSON.parse(row.data)));
  }
  saveWellness(userId: string, value: WellnessCheckIn) {
    const user = this.user(userId), parsed = wellnessSchemaFor(() => athleteToday(user.timezone)).parse(value);
    const existing = this.wellness(userId);
    if (existing.length >= 10000 && !existing.some(entry => entry.date === parsed.date)) throw new ServiceError("The check-in limit is 10,000. Export and remove older entries first.", 422);
    this.backup(userId);
    this.db.prepare("INSERT INTO wellness VALUES (?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET data = excluded.data").run(userId, parsed.date, JSON.stringify(parsed));
    return this.wellness(userId);
  }
  deleteWellness(userId: string, date: string) {
    this.user(userId); this.backup(userId);
    this.db.prepare("DELETE FROM wellness WHERE user_id = ? AND date = ?").run(userId, date);
    return this.wellness(userId);
  }
  planning(userId: string): Planning {
    this.user(userId); const row = this.db.prepare("SELECT data FROM training_planning WHERE user_id = ?").get(userId) as { data: string } | undefined;
    return row ? planningSchema.parse(JSON.parse(row.data)) : emptyPlanning;
  }
  savePlanning(userId: string, value: Planning) {
    const parsed = planningSchema.parse(value); this.user(userId);
    if (parsed.plans.some(plan => plan.input.plannedWorkoutId !== null)) throw new ServiceError("Targets cannot link to completed workouts.", 422);
    const workspace = this.workspace(userId);
    const strengthIds = new Set(strengthCatalog(workspace.records.map(record => record.session), [...workspace.custom, ...parsed.plans.flatMap(plan => plan.input.customExercises)]).map(exercise => exercise.id));
    if (parsed.goals.some(goal => goal.exerciseId && !strengthIds.has(goal.exerciseId))) throw new ServiceError("Goals must reference a known strength exercise.", 422);
    if (workspace.records.some(record => record.session.plannedWorkoutId && !parsed.plans.some(plan => plan.id === record.session.plannedWorkoutId))) throw new ServiceError("Unlink completed workouts before removing their schedule.", 422);
    this.backup(userId);
    this.db.prepare("INSERT INTO training_planning VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data").run(userId, JSON.stringify(parsed));
    return parsed;
  }
  strengthSettings(userId: string): StrengthSettings {
    this.user(userId); const row = this.db.prepare("SELECT data FROM strength_settings WHERE user_id = ?").get(userId) as { data: string } | undefined;
    return row ? strengthSettingsSchema.parse(JSON.parse(row.data)) : { muscles: {}, alternatives: {} };
  }
  saveStrengthSettings(userId: string, value: StrengthSettings) {
    const settings = strengthSettingsSchema.parse(value), workspace = this.workspace(userId);
    const catalog = strengthCatalog(workspace.records.map(r => r.session), workspace.custom), ids = new Set(catalog.map(e => e.id));
    if (Object.keys(settings.muscles).some(id => !ids.has(id)) || Object.entries(settings.alternatives).some(([id, alternatives]) => !ids.has(id) || alternatives.some(target => !ids.has(target)))) throw new ServiceError("Strength settings must reference known strength exercises.", 422);
    this.backup(userId);
    this.db.prepare("INSERT INTO strength_settings VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data").run(userId, JSON.stringify(settings));
    return settings;
  }
  filters(userId: string): SavedHistoryFilter[] {
    this.user(userId); const row = this.db.prepare("SELECT data FROM history_filters WHERE user_id = ?").get(userId) as { data: string } | undefined;
    return row ? savedFiltersSchema.parse(JSON.parse(row.data)) : [];
  }
  saveFilters(userId: string, filters: SavedHistoryFilter[]) {
    const parsed = savedFiltersSchema.parse(filters); this.backup(userId);
    this.db.prepare("INSERT INTO history_filters VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data").run(userId, JSON.stringify(parsed));
    return parsed;
  }
  activeRecord(userId: string, id: string) {
    const row = this.db.prepare("SELECT data FROM workouts WHERE user_id = ? AND id = ? AND deleted = 0").get(userId, id) as { data: string } | undefined;
    if (!row) throw new ServiceError("Session not found.", 404);
    return JSON.parse(row.data) as SessionSubmission;
  }
  scopedRecord(userId: string, id: string) {
    const row = this.db.prepare("SELECT data FROM workouts WHERE user_id = ? AND id = ?").get(userId, id) as { data: string } | undefined;
    if (!row) throw new ServiceError("Session not found.", 404);
    return JSON.parse(row.data) as SessionSubmission;
  }
  canonical(userId: string, input: SessionInput, id: string = randomUUID(), createdAt?: string): SessionSubmission {
    const user = this.user(userId);
    if (input.date > athleteToday(user.timezone)) throw new ServiceError("Choose a date that is not in the future in your timezone.", 422);
    const result = createSession(input);
    result.session.id = id; result.session.userId = userId;
    if (createdAt) result.session.createdAt = createdAt;
    result.metrics = result.metrics.map(m => ({ ...m, sessionId: id, userId }));
    return result;
  }
  save(userId: string, input: SessionInput, id?: string) {
    if (input.plannedWorkoutId && !this.planning(userId).plans.some(plan => plan.id === input.plannedWorkoutId)) throw new ServiceError("Scheduled workout not found.", 422);
    if (input.plannedWorkoutId && this.workspace(userId).records.some(record => record.session.id !== id && record.session.plannedWorkoutId === input.plannedWorkoutId)) throw new ServiceError("This schedule already has a completed workout. Unlink it first.", 409);
    const previous = id ? this.scopedRecord(userId, id) : undefined;
    const result = this.canonical(userId, input, id, previous?.session.createdAt);
    this.backup(userId);
    this.transaction(() => {
      if (id) this.db.prepare("UPDATE workouts SET data = ?, deleted = 0 WHERE id = ? AND user_id = ?").run(JSON.stringify(result), id, userId);
      else this.db.prepare("INSERT INTO workouts (id, user_id, data) VALUES (?, ?, ?)").run(result.session.id, userId, JSON.stringify(result));
    });
    return result;
  }
  setDeleted(userId: string, id: string, deleted: boolean) {
    const record = this.scopedRecord(userId, id); this.backup(userId);
    this.db.prepare("UPDATE workouts SET deleted = ? WHERE id = ? AND user_id = ?").run(deleted ? 1 : 0, id, userId);
    return record;
  }
  deletedRecords(userId: string): SessionSubmission[] {
    this.user(userId);
    const rows = this.db.prepare("SELECT data FROM workouts WHERE user_id = ? AND deleted = 1").all(userId) as { data: string }[];
    return rows.map(row => JSON.parse(row.data));
  }
  saveAssets(userId: string, input: z.infer<typeof assetsSchema>) {
    this.backup(userId);
    this.db.prepare("INSERT INTO assets VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data").run(userId, JSON.stringify(assetsSchema.parse(input)));
  }
  importRecords(userId: string, records: { migrationId: string; input: SessionInput }[]) {
    this.backup(userId);
    let imported = 0;
    this.transaction(() => {
      for (const entry of records) {
        if (this.db.prepare("SELECT source_id FROM imports WHERE user_id = ? AND source_id = ?").get(userId, entry.migrationId) || this.db.prepare("SELECT id FROM workouts WHERE user_id = ? AND migration_id = ?").get(userId, entry.migrationId)) continue;
        if (entry.input.plannedWorkoutId && (!this.planning(userId).plans.some(plan => plan.id === entry.input.plannedWorkoutId) || this.workspace(userId).records.some(record => record.session.plannedWorkoutId === entry.input.plannedWorkoutId))) throw new ServiceError("Import requires an available schedule in this account.", 422);
        const result = this.canonical(userId, entry.input);
        this.db.prepare("INSERT INTO workouts (id, user_id, data, migration_id) VALUES (?, ?, ?, ?)").run(result.session.id, userId, JSON.stringify(result), entry.migrationId);
        this.db.prepare("INSERT INTO imports VALUES (?, ?)").run(userId, entry.migrationId);
        imported++;
      }
    });
    return imported;
  }
  backupDirectory(userId: string) {
    this.user(userId);
    const directory = resolve(this.backupRoot, userId);
    if (!directory.startsWith(this.backupRoot + sep)) throw new ServiceError("Invalid backup directory.");
    return directory;
  }
  backup(userId: string, force = false) {
    const directory = this.backupDirectory(userId); mkdirSync(directory, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    if (!force && readdirSync(directory).some(name => name.startsWith(day))) return;
    const name = `${day}-${Date.now()}-${randomBytes(4).toString("hex")}.json`;
    const target = join(directory, name), temp = target + ".tmp";
    writeFileSync(temp, JSON.stringify({ userId, createdAt: new Date().toISOString(), workspace: this.workspace(userId) }), { mode: 0o600 });
    renameSync(temp, target);
    const names = readdirSync(directory).filter(name => name.endsWith(".json")).sort().reverse();
    names.slice(14).forEach(name => unlinkSync(join(directory, name)));
  }
  backups(userId: string) {
    const directory = this.backupDirectory(userId);
    if (!existsSync(directory)) return [];
    return readdirSync(directory).filter(name => /^\d{4}-\d{2}-\d{2}-\d+-[a-f0-9]{8}\.json$/.test(name)).sort().reverse().map(id => ({ id, date: id.slice(0, 10) }));
  }
  restore(userId: string, backupId: string) {
    if (!this.backups(userId).some(b => b.id === backupId)) throw new ServiceError("Backup not found.", 404);
    const backup = backupSchema.parse(JSON.parse(readFileSync(join(this.backupDirectory(userId), backupId), "utf8")));
    if (backup.userId !== userId) throw new ServiceError("Backup not found.", 404);
    const records = backup.workspace.records.map(r => this.canonical(userId, sessionSchemaFor(() => athleteToday(this.user(userId).timezone)).parse(r.session), r.session.id, r.session.createdAt));
    const wellness = backup.workspace.wellness.map(entry => wellnessSchemaFor(() => athleteToday(this.user(userId).timezone)).parse(entry));
    this.backup(userId, true);
    this.transaction(() => {
      this.db.prepare("DELETE FROM workouts WHERE user_id = ?").run(userId);
      this.db.prepare("DELETE FROM wellness WHERE user_id = ?").run(userId);
      for (const entry of wellness) this.db.prepare("INSERT INTO wellness VALUES (?, ?, ?)").run(userId, entry.date, JSON.stringify(entry));
      this.db.prepare("INSERT INTO training_planning VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data").run(userId, JSON.stringify(backup.workspace.planning));
      this.db.prepare("INSERT INTO strength_settings VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data").run(userId, JSON.stringify(backup.workspace.strengthSettings));
      this.db.prepare("INSERT INTO history_filters VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data").run(userId, JSON.stringify(backup.workspace.savedFilters));
      for (const record of records) this.db.prepare("INSERT INTO workouts (id, user_id, data) VALUES (?, ?, ?)").run(record.session.id, userId, JSON.stringify(record));
      this.db.prepare("INSERT INTO assets VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data").run(userId, JSON.stringify({ custom: backup.workspace.custom, templates: backup.workspace.templates }));
    });
  }
  deleteAccount(userId: string, password: string) {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
    this.throttle("delete:" + userId, 5);
    if (!row || !matchesPassword(password, row.password_hash)) throw new ServiceError("Password is incorrect.", 401);
    const directory = this.backupDirectory(userId);
    // Remove recoverable copies before deleting the account row.
    rmSync(directory, { recursive: true, force: true });
    this.transaction(() => {
      this.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      if (this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'coach_invitations'").get()) this.db.prepare("DELETE FROM coach_invitations WHERE email = ?").run(row.email);
      for (const key of ["login:" + digest(row.email), "recovery:" + digest(row.email), "register:" + row.email, "delete:" + userId, "coach-invite:" + userId, "coach-feedback:" + userId]) this.db.prepare("DELETE FROM attempts WHERE key = ?").run(key);
    });
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }
  close() { this.db.close(); }
}
let singleton: AccountStore | undefined;
export function store() { return singleton ??= new AccountStore(resolve(process.env.LOADFACTOR_DATA_DIR ?? ".data", "loadfactor.sqlite")); }
