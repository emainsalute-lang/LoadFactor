import { describe, it, expect } from "vitest";
import { sessionInputSchema } from "./validation";
import { createSession } from "./sessions";
import { performanceTests, sprintSegments, trialSummary } from "./tests-analysis";
import { rebuildRecord, templatesSchema } from "./workspace";
const base = { exerciseId: "vertical-jump", weightKg: 0, reps: 1, jumpHeightCm: 50, splitTimeSeconds: null, rpe: 7 };
const test = { jumpCategory: "countermovement" as const, approach: "standing" as const, leg: "both" as const, broadJumpCm: null, distanceM: null, splits: [], protocol: "Hands on hips; same mat" };
function input(sets: unknown[]) { return { title: "Testing", date: "2026-09-28", exercises: sets }; }
function record(sets: unknown[]) { return createSession(sessionInputSchema.parse(input(sets))); }
describe("jump and sprint analysis", () => {
  it("separates categories, takeoff, legs and protocols when computing best and means", () => {
    const sets = [{ ...base, test }, { ...base, test, jumpHeightCm: 60 }, { ...base, test: { ...test, leg: "left" } }, { ...base, test: { ...test, leg: "right" } }, { ...base, test: { ...test, approach: "approach" } }, { ...base, test: { ...test, jumpCategory: "squat" } }, { ...base, test: { ...test, protocol: "Different mat" } }];
    const groups = performanceTests([record(sets).session]);
    expect(groups).toHaveLength(6); expect(groups[0]).toMatchObject({ best: 60, average: 55 });
  });
  it("measures broad jumps as distance rather than vertical height", () => {
    const r = record([{ ...base, exerciseId: "broad-jump", jumpHeightCm: null, test: { ...test, jumpCategory: "broad", broadJumpCm: 250 } }]);
    expect(performanceTests([r.session])[0]).toMatchObject({ broad: true, best: 250 }); expect(r.metrics).toEqual([]);
    expect(sessionInputSchema.safeParse(input([{ ...base, exerciseId: "broad-jump" }])).success).toBe(false);
  });
  it("calculates overall and interval speeds from cumulative splits and separates distances", () => {
    const sprint = { ...base, exerciseId: "sprint-test", jumpHeightCm: null, splitTimeSeconds: 5, test: { ...test, distanceM: 30, splits: [{ distanceM: 10, seconds: 2 }, { distanceM: 20, seconds: 3.5 }] } };
    const s = record([sprint, { ...sprint, splitTimeSeconds: 7, test: { ...sprint.test, distanceM: 40 } }]).session;
    const groups = performanceTests([s]); expect(groups).toHaveLength(2); expect(groups[0].trials[0].speedMps).toBe(6);
    expect(sprintSegments(s.exercises[0])).toEqual([{ fromM: 0, toM: 10, seconds: 2, speedMps: 5 }, { fromM: 10, toM: 20, seconds: 1.5, speedMps: 10/1.5 }, { fromM: 20, toM: 30, seconds: 1.5, speedMps: 10/1.5 }]);
  });
  it("rejects unordered, duplicate, out-of-bounds or inconsistent finish splits", () => {
    const sprint = { ...base, exerciseId: "sprint-test", jumpHeightCm: null, splitTimeSeconds: 5 };
    for (const splits of [[{ distanceM: 20, seconds: 3 }, { distanceM: 10, seconds: 4 }], [{ distanceM: 10, seconds: 2 }, { distanceM: 20, seconds: 2 }], [{ distanceM: 40, seconds: 4 }], [{ distanceM: 20, seconds: 6 }], [{ distanceM: 30, seconds: 4 }]]) expect(sessionInputSchema.safeParse(input([{ ...sprint, test: { ...test, distanceM: 30, splits } }])).success).toBe(false);
    expect(sessionInputSchema.safeParse(input([sprint])).success).toBe(false);
  });
  it("keeps legacy data compatible without inventing unknown sprint distances", () => {
    const r = record([base, { ...base, exerciseId: "10m-fly", jumpHeightCm: null, splitTimeSeconds: 1.2 }, { ...base, exerciseId: "shuttle-run", jumpHeightCm: null, splitTimeSeconds: 8 }]);
    const groups = performanceTests([r.session]); expect(groups[0].variant).toBe("vertical / standing / both"); expect(groups[1].trials[0].speedMps).toBeCloseTo(10/1.2); expect(groups[2].trials[0].speedMps).toBeNull();
  });
  it("uses per-trial values for mean, lower sprint best and population CV", () => {
    expect(trialSummary([2,4], true)).toMatchObject({ best: 2, average: 3 }); expect(trialSummary([2,4], true).cvPercent).toBeCloseTo(100/3);
    expect(trialSummary([5], false).cvPercent).toBeNull(); expect(trialSummary([], false).best).toBeNull();
  });
  it("preserves test details through rebuilds and templates", () => {
    const r = record([{ ...base, test }]); expect(rebuildRecord(JSON.parse(JSON.stringify(r)))?.session.exercises[0].test).toEqual(test);
    expect(templatesSchema.parse([{ id: "t", name: "Jump protocol", input: r.session }])[0].input.exercises[0].test).toEqual(test);
  });
  it("rejects incompatible measurements and excludes alternate jump variants from legacy PR metrics", () => {
    expect(sessionInputSchema.safeParse(input([{ ...base, exerciseId: "bench-press", jumpHeightCm: null, test }])).success).toBe(false);
    expect(sessionInputSchema.safeParse(input([{ ...base, test: { ...test, distanceM: 30 } }])).success).toBe(false);
    expect(record([{ ...base, test: { ...test, leg: "left" } }]).metrics).toEqual([]);
    expect(record([{ ...base, exerciseId: "10m-fly", jumpHeightCm: null, splitTimeSeconds: 5, test: { ...test, distanceM: 30 } }]).metrics).toEqual([]);
  });
});
