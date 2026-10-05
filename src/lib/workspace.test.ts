import { describe, expect, it } from "vitest";
import { moveSet, moveExercise, rebuildRecord } from "./workspace";
import { createSession } from "./sessions";
import { sessionInputSchema } from "./validation";
describe("workspace records", () => {
  it("restores edited records and recalculates totals rather than trusting stored metrics", () => {
    const result = createSession(sessionInputSchema.parse({ title: "Edited", date: "2026-09-28", exercises: [{ exerciseId: "trap-bar-deadlift", weightKg: 100, reps: 3, jumpHeightCm: null, splitTimeSeconds: null, rpe: 7 }] }));
    result.session.volumeKg = 999;
    result.session.userId = "firebase-athlete";
    const restored = rebuildRecord(result)!;
    expect(restored.session.id).toBe(result.session.id);
    expect(restored.session.createdAt).toBe(result.session.createdAt);
    expect(restored.session.userId).toBe("firebase-athlete");
    expect(restored.session.volumeKg).toBe(300);
    expect(rebuildRecord({ session: { id: "invalid" } })).toBeNull();
  });
  it("moves entire exercise groups while preserving set order", () => {
    const sets = [{ exerciseId: "a", reps: 5 }, { exerciseId: "b", reps: 3 }, { exerciseId: "a", reps: 2 }];
    expect(moveExercise(sets, "b", -1)).toEqual([sets[1], sets[0], sets[2]]);
    expect(moveExercise(sets, "a", -1)).toEqual(sets);
  });
  it("moves sets without dropping values or mutating the original", () => {
    const sets = ["squat", "jump", "squat"];
    expect(moveSet(sets, 1, -1)).toEqual(["jump", "squat", "squat"]);
    expect(moveSet(sets, 2, 1)).toEqual(sets);
    expect(sets).toEqual(["squat", "jump", "squat"]);
  });
});
