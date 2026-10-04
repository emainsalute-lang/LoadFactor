import { describe, expect, it } from "vitest";
import { chartData, heightToCm, summarize, weekStart, weightToKg } from "./analytics";
import { sessionInputSchema } from "./validation";
import { createSession } from "./sessions";
const date = "2026-09-28";
const strength = { exerciseId: "trap-bar-deadlift", weightKg: 100, reps: 5, jumpHeightCm: null, splitTimeSeconds: null, rpe: 8 };
describe("athlete records", () => {
  it("normalizes mixed units and computes volume and mean set RPE", () => {
    const input = sessionInputSchema.parse({ title: "Strength", date, exercises: [strength, { ...strength, weightKg: weightToKg(220.46226218, "lbs"), reps: 3, rpe: 6 }] });
    const result = createSession(input);
    expect(result.session.volumeKg).toBeCloseTo(800);
    expect(result.session.averageRpe).toBe(7);
    expect(heightToCm(30, "in")).toBeCloseTo(76.2);
  });
  it("keeps shuttle splits out of the 10m sprint PR", () => {
    const input = sessionInputSchema.parse({ title: "Speed", date, exercises: [
      { ...strength, exerciseId: "10m-fly", weightKg: 0, splitTimeSeconds: 1.1 },
      { ...strength, exerciseId: "shuttle-run", weightKg: 0, splitTimeSeconds: 0.9 },
    ] });
    const result = createSession(input);
    expect(summarize([result.session], result.metrics, date).sprintPr).toBe(1.1);
  });
  it("uses Monday-based weeks across month boundaries and includes empty weeks", () => {
    expect(weekStart("2026-10-04")).toBe("2026-09-28");
    const result = createSession(sessionInputSchema.parse({ title: "Lift", date, exercises: [strength] }));
    expect(summarize([result.session], [], "2026-10-03").weeklyVolume).toBe(500);
    expect(summarize([result.session], [], "2026-10-05").weeklyVolume).toBe(0);
    expect(chartData([result.session], [], "2026-10-03", 30).volume.some(p => p.value === 0)).toBe(true);
  });
  it("rejects impossible dates, missing measurements, and invalid RPE", () => {
    expect(sessionInputSchema.safeParse({ title: "Bad", date: "2026-02-30", exercises: [strength] }).success).toBe(false);
    expect(sessionInputSchema.safeParse({ title: "Bad", date, exercises: [{ ...strength, exerciseId: "depth-jump" }] }).success).toBe(false);
    expect(sessionInputSchema.safeParse({ title: "Bad", date, exercises: [{ ...strength, rpe: 11 }] }).success).toBe(false);
    expect(sessionInputSchema.safeParse({ title: "Bad", date, exercises: [{ ...strength, videoUrl: "javascript:alert(1)" }] }).success).toBe(false);
    expect(sessionInputSchema.safeParse({ title: "Bad", date, exercises: [{ ...strength, videoUrl: "http://example.com/technique.mp4" }] }).success).toBe(false);
    expect(sessionInputSchema.parse({ title: "Video", date, exercises: [{ ...strength, videoUrl: "https://example.com/technique.mp4" }] }).exercises[0].videoUrl).toBe("https://example.com/technique.mp4");
  });
  it("generates daily-best jump points rather than summing attempts", () => {
    const result = createSession(sessionInputSchema.parse({ title: "Jump", date, exercises: [70, 76, 73].map(value => ({ ...strength, exerciseId: "vertical-jump", weightKg: 0, jumpHeightCm: value })) }));
    expect(chartData([result.session], result.metrics, "2026-10-03", 14).jumps[0].value).toBe(76);
  });
});

describe("custom exercise validation", () => {
  const customExercises = [{ id: "custom-hop", name: "Single leg hop", kind: "jump" }];
  it("accepts custom measurements without misclassifying them as a standard PR", () => {
    const input = sessionInputSchema.parse({ title: "Custom", date, customExercises, exercises: [{ ...strength, exerciseId: "custom-hop", jumpHeightCm: 35 }] });
    const result = createSession(input);
    expect(result.session.customExercises).toEqual(customExercises);
    expect(result.session.volumeKg).toBe(500);
    expect(result.metrics).toEqual([]);
  });
  it("rejects missing custom measurements and unknown or duplicate definitions", () => {
    expect(sessionInputSchema.safeParse({ title: "Custom", date, customExercises, exercises: [{ ...strength, exerciseId: "custom-hop" }] }).success).toBe(false);
    expect(sessionInputSchema.safeParse({ title: "Custom", date, exercises: [{ ...strength, exerciseId: "custom-missing" }] }).success).toBe(false);
    expect(sessionInputSchema.safeParse({ title: "Custom", date, customExercises: [...customExercises, ...customExercises], exercises: [strength] }).success).toBe(false);
  });
});
