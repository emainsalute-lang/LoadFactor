import { describe, expect, it } from "vitest";
import { bodyweightHistory, wellnessComparison, wellnessHistorySchema, wellnessSchemaFor } from "./wellness";
import { sessionTrainingLoad, weightToKg } from "./analytics";
import { createSession } from "./sessions";
import { sessionInputSchema } from "./validation";
import { rebuildRecord, templatesSchema } from "./workspace";
import { performanceTests } from "./tests-analysis";
const schema = wellnessSchemaFor(() => "2026-10-04");
const set = { exerciseId: "back-squat", weightKg: 100, reps: 5, jumpHeightCm: null, splitTimeSeconds: null, rpe: 8 };
function workout(extra: object = {}) { return createSession(sessionInputSchema.parse({ title: "Training", date: "2026-10-01", exercises: [set], ...extra })); }
describe("wellness and session load", () => {
  it("accepts partial reports, zero sleep and regional soreness without inferring missing ratings", () => {
    expect(schema.parse({ date: "2026-10-01", sleepHours: 0 })).toMatchObject({ sleepHours: 0, sleepQuality: null, stress: null, bodyweightKg: null });
    expect(schema.parse({ date: "2026-10-01", muscleSoreness: { quads: 4 } }).muscleSoreness).toEqual({ quads: 4 });
    expect(schema.parse({ date: "2026-10-01", notes: "Rest day" }).notes).toBe("Rest day");
  });
  it("rejects invalid dates, future dates, empty reports, impossible measures and duplicate dates", () => {
    for (const value of [{ date: "2026-02-30", sleepHours: 8 }, { date: "2026-10-05", sleepHours: 8 }, { date: "2026-10-01" }, { date: "2026-10-01", sleepHours: 25 }, { date: "2026-10-01", stress: 0 }, { date: "2026-10-01", mood: 6 }, { date: "2026-10-01", soreness: 2.5 }, { date: "2026-10-01", bodyweightKg: 0 }, { date: "2026-10-01", muscleSoreness: { unknown: 2 } }]) expect(schema.safeParse(value).success).toBe(false);
    const entry = schema.parse({ date: "2026-10-01", sleepHours: 8 }); expect(wellnessHistorySchema.safeParse([entry, entry]).success).toBe(false);
  });
  it("calculates session load independently from mean set RPE and keeps unrecorded load null", () => {
    const r = workout({ durationMinutes: 60, sessionRpe: 6, sessionLoad: 999 });
    expect(r.session.averageRpe).toBe(8); expect(r.session.sessionRpe).toBe(6); expect(r.session.sessionLoad).toBe(360);
    expect(workout().session.sessionLoad).toBeNull(); expect(workout({ durationMinutes: 60 }).session.sessionLoad).toBeNull();
    expect(workout({ durationMinutes: 30, sessionRpe: 0 }).session.sessionLoad).toBe(0);
    expect(workout({ durationMinutes: 45.5, sessionRpe: 6.5 }).session.sessionLoad).toBe(295.75);
    expect(sessionTrainingLoad({ durationMinutes: Infinity, sessionRpe: 6 })).toBeNull();
    for (const extra of [{ durationMinutes: 0 }, { durationMinutes: 1441 }, { sessionRpe: 11 }, { sessionRpe: -1 }]) expect(sessionInputSchema.safeParse({ ...r.session, ...extra }).success).toBe(false);
  });
  it("preserves session metadata in rebuilds and templates and recomputes forged loads", () => {
    const r = workout({ durationMinutes: 60, sessionRpe: 7 });
    const rebuilt = rebuildRecord({ session: { ...r.session, sessionLoad: 12345 } });
    expect(rebuilt?.session.sessionLoad).toBe(420);
    expect(templatesSchema.parse([{ id: "t", name: "Strength", input: r.session }])[0].input).toMatchObject({ durationMinutes: 60, sessionRpe: 7 });
  });
  it("uses daily bodyweight first and latest workout fallback without rewriting snapshots", () => {
    const first = workout({ bodyweightKg: 80 }).session, last = { ...workout({ bodyweightKg: 82 }).session, createdAt: "9999" };
    const entry = schema.parse({ date: "2026-10-01", bodyweightKg: weightToKg(176.369809744, "lbs") });
    expect(bodyweightHistory([], [last, first])[0].bodyweightKg).toBe(82);
    expect(bodyweightHistory([entry], [last, first])[0].bodyweightKg).toBeCloseTo(80); expect(last.bodyweightKg).toBe(82);
  });
  it("aligns reports and outcomes by date with gaps and explicit load coverage", () => {
    const entries = [schema.parse({ date: "2026-10-01", sleepHours: 7, stress: 3 }), schema.parse({ date: "2026-10-03", mood: 4 })];
    const sessions = [workout({ durationMinutes: 60, sessionRpe: 6 }).session, workout().session, workout({ durationMinutes: 30, sessionRpe: 0 }).session];
    const points = wellnessComparison(entries, sessions, "2026-10-04", 4, "", "back-squat");
    expect(points).toHaveLength(4); expect(points[0]).toMatchObject({ date: "2026-10-01", sleepHours: 7, load: 360, sessions: 3, loadSessions: 2, volumeKg: 1500 });
    expect(points[0].estimateKg).toBeCloseTo(116.6667); expect(points[1]).toMatchObject({ sleepHours: null, load: null, volumeKg: null, sessions: 0 });
    expect(points[2]).toMatchObject({ mood: 4, load: null });
  });
  it("compares the chosen jump protocol without mixing legs or sprint distances", () => {
    const test = { jumpCategory: "countermovement", approach: "standing", leg: "both", broadJumpCm: null, distanceM: null, splits: [], protocol: "Mat" };
    const jump = { ...set, exerciseId: "countermovement-jump", weightKg: 0, jumpHeightCm: 50, test };
    const s = workout({ exercises: [jump, { ...jump, jumpHeightCm: 80, test: { ...test, leg: "left" } }] }).session;
    const selected = performanceTests([s])[0];
    expect(wellnessComparison([], [s], "2026-10-01", 1, selected.key)[0].performance).toBe(50);
  });
});
