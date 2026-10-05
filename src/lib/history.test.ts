import { describe, expect, it } from "vitest";
import { emptyFilter, filterHistory, historyFilterSchema, historySummary, monthDays, monthlySummary, savedFiltersSchema, sessionTotals, shiftMonth } from "./history";
import { sessionInputSchema } from "./validation";
import { createSession } from "./sessions";
const set = { exerciseId: "trap-bar-deadlift", weightKg: 100, reps: 5, jumpHeightCm: null, splitTimeSeconds: null, rpe: 8 };
function session(title: string, date: string, tags: string[] = [], sets = [set], notes = "") { return createSession(sessionInputSchema.parse({ title, date, tags, notes, exercises: sets })).session; }
describe("training history", () => {
  it("reports exactly the filtered sessions using recorded sets rather than stored totals", () => {
    const a = session("Speed strength", "2026-09-28", ["speed"], [set, { ...set, weightKg: 50, reps: 4, rpe: 6 }]);
    const b = session("Evening", "2026-09-28", ["speed"], [{ ...set, weightKg: 0, reps: 10, rpe: 4 }]);
    const other = session("Other", "2026-08-31");
    a.volumeKg = 9999;
    const visible = filterHistory([a, b, other], { ...emptyFilter, tag: "speed" });
    expect(historySummary(visible)).toEqual({ sessions: 2, trainingDays: 1, sets: 3, volumeKg: 700, averageRpe: 6 });
    expect(historySummary([])).toEqual({ sessions: 0, trainingDays: 0, sets: 0, volumeKg: 0, averageRpe: null });
  });
  it("combines title/notes search, exercise, category, tags, and inclusive dates", () => {
    const a = session("Lower body", "2026-09-28", ["power"], [set], "Great acceleration work");
    const b = session("Upper body", "2026-09-29", ["power"]);
    const filter = { ...emptyFilter, query: " ACCELERATION ", exerciseId: set.exerciseId, category: "strength" as const, tag: "power", from: "2026-09-28", to: "2026-09-28" };
    expect(filterHistory([a, b], filter)).toEqual([a]);
    expect(filterHistory([a, b], { ...filter, category: "sprint" })).toEqual([]);
    expect(historyFilterSchema.safeParse({ ...emptyFilter, from: "2026-09-30", to: "2026-09-28" }).success).toBe(false);
    expect(historyFilterSchema.safeParse({ ...emptyFilter, from: "2026-02-30" }).success).toBe(false);
  });
  it("recognizes custom exercise categories and orders sessions newest first", () => {
    const custom = createSession(sessionInputSchema.parse({ title: "Hop", date: "2026-09-29", customExercises: [{ id: "custom-hop", name: "Hop", kind: "jump" }], exercises: [{ ...set, exerciseId: "custom-hop", jumpHeightCm: 20 }] })).session;
    const old = session("Old", "2026-09-28");
    expect(filterHistory([old, custom], emptyFilter)).toEqual([custom, old]);
    expect(filterHistory([old, custom], { ...emptyFilter, category: "jump", exerciseId: "custom-hop" })).toEqual([custom]);
  });
  it("builds Monday-first calendars across leap years and year boundaries", () => {
    const february = monthDays("2024-02"); expect(february).toHaveLength(42); expect(february.slice(0, 3)).toEqual([null, null, null]);
    expect(february.filter(Boolean)).toHaveLength(29); expect(february).toContain("2024-02-29");
    expect(monthDays("2026-02").filter(Boolean)).toHaveLength(28);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12"); expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("1000-01", -1)).toBe("1000-01"); expect(shiftMonth("9999-12", 1)).toBe("9999-12");
  });
  it("computes monthly set-weighted RPE, volume, and distinct training days", () => {
    const a = session("Morning", "2026-09-28", [], [set, { ...set, rpe: 6 }]), b = session("Evening", "2026-09-28", [], [{ ...set, rpe: 4 }]);
    const other = session("Other month", "2026-08-31");
    expect(monthlySummary([a, b, other], "2026-09")).toEqual({ sessions: 2, trainingDays: 1, sets: 3, volumeKg: 1500, averageRpe: 6 });
    expect(monthlySummary([], "2026-10").averageRpe).toBeNull();
  });
  it("keeps unmatched custom tests out of standard comparison benchmarks", () => {
    const s = createSession(sessionInputSchema.parse({ title: "Tests", date: "2026-09-28", customExercises: [{ id: "custom-sprint", name: "20m sprint", kind: "sprint" }], exercises: [{ ...set, exerciseId: "custom-sprint", splitTimeSeconds: 0.5 }, { ...set, exerciseId: "10m-fly", splitTimeSeconds: 1.2 }, { ...set, exerciseId: "shuttle-run", splitTimeSeconds: 0.8 }] })).session;
    expect(sessionTotals(s).sprintSeconds).toBe(1.2); expect(sessionTotals(s).jumpCm).toBeNull();
  });
  it("normalizes session tags and rejects excessive or invalid saved filters", () => {
    expect(session("Tagged", "2026-09-28", [" Power ", "power"]).tags).toEqual(["power"]);
    expect(sessionInputSchema.safeParse({ title: "Bad tags", date: "2026-09-28", tags: Array(11).fill("tag"), exercises: [set] }).success).toBe(false);
    const preset = { id: "one", name: "Jumps", filter: { ...emptyFilter, category: "jump" } };
    expect(savedFiltersSchema.safeParse([preset]).success).toBe(true);
    expect(savedFiltersSchema.safeParse([preset, preset]).success).toBe(false);
    expect(savedFiltersSchema.safeParse([{ ...preset, filter: { ...emptyFilter, category: "invalid" } }]).success).toBe(false);
  });
});
