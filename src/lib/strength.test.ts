import { describe, expect, it } from "vitest";
import { estimatedOneRepMax, repetitionRecords, strengthSeries, weeklyMuscleSets, emptyStrengthSettings } from "./strength";
import { createSession } from "./sessions";
import { sessionInputSchema, strengthSettingsSchema } from "./validation";
import { weightToKg } from "./analytics";
const base = { exerciseId: "trap-bar-deadlift", weightKg: 100, reps: 5, jumpHeightCm: null, splitTimeSeconds: null, rpe: 8 };
function make(exercises: unknown[], extra: object = {}) { return createSession(sessionInputSchema.parse({ title: "Strength", date: "2026-09-28", exercises, ...extra })).session; }
describe("strength analytics", () => {
  it("estimates 1RM from 1-10 rep working sets and excludes warm-ups, drops and zero loads", () => {
    expect(estimatedOneRepMax(base)).toBeCloseTo(116.6667);
    expect(estimatedOneRepMax({ ...base, reps: 1 })).toBe(100);
    expect(estimatedOneRepMax({ ...base, weightKg: weightToKg(220.46226218, "lbs") })).toBeCloseTo(116.6667);
    for (const set of [{ ...base, reps: 11 }, { ...base, reps: 0 }, { ...base, reps: 2.5 }, { ...base, weightKg: 0 }, { ...base, setType: "warmup" as const }, { ...base, setType: "drop" as const }]) expect(estimatedOneRepMax(set)).toBeNull();
  });
  it("keeps historical bodyweight ratios and splits volume without counting warm-ups as records", () => {
    const s = make([{ ...base, dropGroup: "D1" }, { ...base, setType: "drop", dropGroup: "D1", weightKg: 80 }, { ...base, setType: "warmup", weightKg: 200 }], { bodyweightKg: 80 });
    const point = strengthSeries([s], base.exerciseId, "2026-10-04", 14)[0];
    expect(point.estimateKg).toBeCloseTo(116.6667); expect(point.ratio).toBeCloseTo(116.6667 / 80);
    expect(point.workingVolumeKg).toBe(900); expect(point.warmupVolumeKg).toBe(1000);
    expect(repetitionRecords([s], base.exerciseId)[0].weightKg).toBe(100);
    expect(strengthSeries([make([base])], base.exerciseId, "2026-10-04", 14)[0].ratio).toBeNull();
  });
  it("keeps strength records separate from jumps and from different exercises", () => {
    const s = make([base, { ...base, exerciseId: "bench-press", weightKg: 60 }, { ...base, exerciseId: "vertical-jump", jumpHeightCm: 70, weightKg: 500 }]);
    expect(repetitionRecords([s], "bench-press")[0].weightKg).toBe(60);
    expect(repetitionRecords([s], "vertical-jump")).toEqual([]);
    expect(strengthSeries([s], "vertical-jump", "2026-10-04", 90)).toEqual([]);
    expect(strengthSeries([s], base.exerciseId, "2026-10-04", 3)).toEqual([]);
  });
  it("records each exact rep count independently and chooses the latest tied record", () => {
    const a = make([base, { ...base, reps: 3, weightKg: 120 }]), b = make([base], { date: "2026-09-29" });
    const records = repetitionRecords([b, a], base.exerciseId);
    expect(records.map(r => r.reps)).toEqual([3, 5]); expect(records[0].weightKg).toBe(120); expect(records[1].sessionId).toBe(b.id);
  });
  it("includes high-repetition records without using them for estimated one-rep maxima", () => {
    const s = make([{ ...base, reps: 25, weightKg: 40 }, { ...base, reps: 25, weightKg: 50 }, { ...base, reps: 30, weightKg: 35 }, { ...base, reps: 25, weightKg: 60, setType: "warmup" }]);
    expect(repetitionRecords([s], base.exerciseId).map(r => [r.reps, r.weightKg])).toEqual([[25, 50], [30, 35]]);
    expect(strengthSeries([s], base.exerciseId, "2026-10-04", 14)[0].estimateKg).toBeNull();
  });
  it("counts assigned muscles, drop stages and unassigned custom exercises within Monday weeks", () => {
    const s = make([{ ...base, dropGroup: "D1" }, { ...base, dropGroup: "D1", setType: "drop", weightKg: 80 }, { ...base, setType: "warmup" }, { ...base, exerciseId: "custom-lift" }], { customExercises: [{ id: "custom-lift", name: "Custom lift", kind: "strength" }] });
    const rows = weeklyMuscleSets([s], "2026-10-04", emptyStrengthSettings);
    expect(rows.find(r => r.group === "quads")).toMatchObject({ working: 1, drop: 1, total: 2 });
    expect(rows.find(r => r.group === "unassigned")?.total).toBe(1);
    expect(weeklyMuscleSets([s], "2026-10-05", emptyStrengthSettings).every(r => r.total === 0)).toBe(true);
    expect(weeklyMuscleSets([s], "2026-10-04", { muscles: { [base.exerciseId]: ["back"] }, alternatives: {} }).find(r => r.group === "quads")?.total).toBe(0);
  });
});
describe("strength logging validation", () => {
  it("defaults older records to working sets without inferred bodyweight", () => {
    const s = make([base]); expect(s.bodyweightKg).toBeNull(); expect(s.exercises[0]).toMatchObject({ setType: "working", superset: null, dropGroup: null, tempo: null, pauseSeconds: null });
  });
  it("preserves valid supersets, tempo, pauses and ordered drop sequences", () => {
    const s = make([{ ...base, superset: "a", dropGroup: "d1", tempo: "3-1-x-0", pauseSeconds: 2 }, { ...base, exerciseId: "bench-press", superset: "a" }, { ...base, setType: "drop", dropGroup: "d1", weightKg: 80 }]);
    expect(s.exercises[0]).toMatchObject({ superset: "A", dropGroup: "D1", tempo: "3-1-X-0", pauseSeconds: 2 });
    expect(s.exercises[2].setType).toBe("drop");
  });
  it("rejects missing anchors, rising drop loads, wrong exercises and incomplete supersets", () => {
    for (const sets of [[{ ...base, setType: "drop", dropGroup: "D1" }], [{ ...base, dropGroup: "D1" }, { ...base, dropGroup: "D1", setType: "drop", weightKg: 110 }], [{ ...base, dropGroup: "D1" }, { ...base, exerciseId: "bench-press", dropGroup: "D1", setType: "drop", weightKg: 80 }], [{ ...base, superset: "A" }]]) expect(sessionInputSchema.safeParse({ title: "Bad", date: "2026-09-28", exercises: sets }).success).toBe(false);
  });
  it("rejects strength-only metadata on sprints and out-of-range tempo, pauses and bodyweight", () => {
    for (const extra of [{ tempo: "31-0-X-0" }, { pauseSeconds: 61 }, { tempo: "3-1-X" }]) expect(sessionInputSchema.safeParse({ title: "Bad", date: "2026-09-28", exercises: [{ ...base, ...extra }] }).success).toBe(false);
    expect(sessionInputSchema.safeParse({ title: "Bad", date: "2026-09-28", bodyweightKg: 0, exercises: [base] }).success).toBe(false);
    expect(sessionInputSchema.safeParse({ title: "Bad", date: "2026-09-28", exercises: [{ ...base, exerciseId: "10m-fly", splitTimeSeconds: 1.2, setType: "warmup" }] }).success).toBe(false);
  });
  it("bounds muscle settings and prevents duplicate or self-substitutions", () => {
    expect(strengthSettingsSchema.safeParse({ muscles: { "bench-press": ["chest", "chest"] }, alternatives: {} }).success).toBe(false);
    expect(strengthSettingsSchema.safeParse({ muscles: {}, alternatives: { "bench-press": ["bench-press"] } }).success).toBe(false);
    expect(strengthSettingsSchema.safeParse({ muscles: {}, alternatives: { "bench-press": ["overhead-press"] } }).success).toBe(true);
  });
});
