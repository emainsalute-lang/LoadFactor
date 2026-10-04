import { describe, expect, it } from "vitest";
import { blockPlans, comparePlan, completedPlan, emptyPlanning, goalProgress, planningSchema, shiftDate, type Planning } from "./planning";
import { sessionInputSchema } from "./validation";
import { createSession } from "./sessions";
import { trainingCalendar } from "./calendar-export";
const input = sessionInputSchema.parse({ title: "Lower body", date: "2026-09-28", exercises: [{ exerciseId: "back-squat", weightKg: 100, reps: 5, jumpHeightCm: null, splitTimeSeconds: null, rpe: 8 }] });
const block: Planning["blocks"][number] = { id: "block", name: "Build", start: "2026-09-28", weeks: 5, rule: { mode: "load", increment: 5, deloadEvery: 4, deloadPercent: 30 } };
describe("training planning", () => {
  it("exports scheduled workouts as escaped all-day iCalendar events", () => {
    const plan = blockPlans(input, "Lower", block, [1], () => "plan-id")[0];
    const calendar = trainingCalendar([{ ...plan, input: { ...plan.input, title: "Lift,; today" } }]);
    expect(calendar).toContain("DTSTART;VALUE=DATE:20260928");
    expect(calendar).toContain("SUMMARY:Lift\\,\\; today");
    expect(calendar).toContain("END:VCALENDAR");
  });
  it("schedules selected weekdays across multiweek blocks with progression and deloads", () => {
    let n = 0; const plans = blockPlans(input, "Lower body", block, [1, 3], () => String(++n));
    expect(plans).toHaveLength(10); expect(plans.slice(0, 2).map(p => p.date)).toEqual(["2026-09-28", "2026-09-30"]);
    expect(plans.filter((_, i) => i % 2 === 0).map(p => p.input.exercises[0].weightKg)).toEqual([100, 105, 110, 80.5, 115]);
    expect(plans[6].deload).toBe(true); expect(planningSchema.safeParse({ ...emptyPlanning, blocks: [block], plans }).success).toBe(true);
  });
  it("supports rep progression without changing jump and sprint targets", () => {
    const template = sessionInputSchema.parse({ ...input, exercises: [...input.exercises, { exerciseId: "vertical-jump", weightKg: 0, reps: 1, jumpHeightCm: 50, splitTimeSeconds: null, rpe: 7 }] });
    const plans = blockPlans(template, "Mixed", { ...block, weeks: 3, rule: { ...block.rule, mode: "reps", increment: 1 } }, [1]);
    expect(plans.map(p => p.input.exercises[0].reps)).toEqual([5, 6, 7]); expect(plans.every(p => p.input.exercises[1].reps === 1)).toBe(true);
    expect(input.exercises[0].reps).toBe(5);
    const deloadPlans = blockPlans(input, "Strength", { ...block, rule: { ...block.rule, mode: "reps", increment: 1 } }, [1]);
    expect(deloadPlans.map(p => p.input.exercises[0].reps)).toEqual([5, 6, 7, 8, 8]);
  });
  it("reschedules without losing original dates and rejects invalid dates, IDs and references", () => {
    const plan = blockPlans(input, "Lower", block, [1], () => "plan")[0];
    const rescheduled = { ...plan, date: "2026-10-05", input: { ...plan.input, date: "2026-10-05" } };
    expect(rescheduled.originalDate).toBe("2026-09-28");
    expect(planningSchema.safeParse({ ...emptyPlanning, blocks: [block], plans: [rescheduled] }).success).toBe(true);
    for (const plans of [[plan, plan], [{ ...plan, blockId: "unknown" }], [{ ...plan, date: "2026-02-30" }], [{ ...plan, date: "2026-10-01" }]]) expect(planningSchema.safeParse({ ...emptyPlanning, blocks: [block], plans }).success).toBe(false);
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("links completion explicitly and compares actual totals and set targets", () => {
    const plan = blockPlans(input, "Lower", block, [1], () => "plan")[0];
    const actual = createSession({ ...input, plannedWorkoutId: plan.id, exercises: [{ ...input.exercises[0], reps: 4, weightKg: 90, rpe: 9 }] }).session;
    expect(completedPlan(plan, [actual])?.id).toBe(actual.id);
    expect(completedPlan(plan, [createSession(input).session])).toBeUndefined();
    const row = comparePlan(plan, actual)[0]; expect(row.planned).toEqual({ sets: 1, reps: 5, volumeKg: 500 }); expect(row.completed).toEqual({ sets: 1, reps: 4, volumeKg: 360 }); expect(row.targets[0].rpe).toBe(8); expect(row.actual[0].rpe).toBe(9);
  });
  it("tracks goals from active workouts in their date range and qualifying sets", () => {
    const session = createSession(input).session;
    const goal: Planning["goals"][number] = { id: "g", name: "Train", metric: "sessions", exerciseId: "", start: "2026-09-01", end: "2026-09-30", baseline: 0, target: 2, minReps: 1 };
    expect(goalProgress(goal, [session])).toEqual({ value: 1, percent: 50, achieved: false });
    expect(goalProgress({ ...goal, start: "2026-09-29" }, [session]).value).toBe(0);
    expect(goalProgress({ ...goal, metric: "load", exerciseId: "back-squat", baseline: 90, target: 110, minReps: 5 }, [session]).percent).toBe(50);
    expect(goalProgress({ ...goal, metric: "load", exerciseId: "back-squat", minReps: 6 }, [session]).value).toBe(0);
    expect(goalProgress({ ...goal, metric: "e1rm", exerciseId: "back-squat" }, [session]).value).toBeCloseTo(116.6667);
    expect(goalProgress({ ...goal, metric: "volume", target: 500 }, [session]).achieved).toBe(true);
  });
});
