import { describe, expect, it } from "vitest";
import { emptyPlanning, planningSchema, type WorkoutDocument } from "./planning";
import { trainingCalendar } from "./calendar-export";

const document: WorkoutDocument = {
  id: "daily-workout", date: "2026-10-06", title: "Speed & strength",
  objective: "Practice acceleration", warmup: "Jog for 5 minutes\nDynamic mobility",
  cooldown: "Walk and stretch", notes: "Bring a stopwatch",
  rows: [
    { id: "sprint", name: "Acceleration sprint", sets: 4, reps: "20 m", load: "Comfortable effort", rest: "2 minutes", instructions: "Start from standing" },
    { id: "squat", name: "Back Squat", sets: 3, reps: "8 reps", load: "40 kg", rest: "90 seconds", instructions: "Controlled lowering" },
  ],
};

describe("daily workout documents", () => {
  it("restores old planning data with an empty document collection", () => {
    expect(planningSchema.parse({ plans: [], blocks: [], goals: [] }).documents).toEqual([]);
  });
  it("preserves document sections, ordered exercises and prescriptions without creating completed workouts", () => {
    const restored = planningSchema.parse(JSON.parse(JSON.stringify({ ...emptyPlanning, documents: [document] })));
    expect(restored.documents[0]).toEqual(document);
    expect(restored.plans).toEqual([]);
    expect(restored.documents[0].rows[0].reps).toBe("20 m");
  });
  it("rejects invalid dates, empty exercise prescriptions and duplicate document IDs", () => {
    for (const documents of [
      [{ ...document, date: "2026-02-30" }],
      [{ ...document, rows: [{ ...document.rows[0], reps: "" }] }],
      [{ ...document, rows: [{ ...document.rows[0], sets: 0 }] }],
      [document, document],
    ]) expect(planningSchema.safeParse({ ...emptyPlanning, documents }).success).toBe(false);
  });
  it("includes workout documents in calendar exports with their date and exercise instructions", () => {
    const calendar = trainingCalendar([], [document]);
    expect(calendar).toContain("DTSTART;VALUE=DATE:20261006");
    expect(calendar).toContain("SUMMARY:Speed & strength");
    expect(calendar).toContain("Acceleration sprint: 4 sets × 20 m");
    expect(calendar).toContain("rest 2 minutes / Start from standing");
    expect(calendar).toContain("Warm-up: Jog for 5 minutes\\nDynamic mobility");
  });
});
