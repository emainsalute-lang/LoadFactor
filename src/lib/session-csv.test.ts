import { describe, expect, it } from "vitest";
import { exportSessionsCsv, previewSessionsCsv } from "./session-csv";
import { createSession } from "./sessions";
import { sessionInputSchema } from "./validation";

const session = createSession(sessionInputSchema.parse({
  title: 'Power, "A"',
  date: "2026-10-03",
  notes: "A note",
  exercises: [{ exerciseId: "trap-bar-deadlift", weightKg: 100, reps: 5, jumpHeightCm: null, splitTimeSeconds: null, rpe: 8 }],
})).session;

describe("session CSV", () => {
  it("exports and previews CSV with quoted session JSON", () => {
    const preview = previewSessionsCsv(exportSessionsCsv([session]), "2026-10-04");
    expect(preview).toHaveLength(1);
    expect(preview[0].session?.title).toBe('Power, "A"');
  });
  it("reports invalid rows and rejects unsupported headers", () => {
    const csv = 'session_json\r\n"{""title"":""Bad"",""date"":""2999-01-01""}"\r\n';
    expect(previewSessionsCsv(csv, "2026-10-04")[0].error).toBeTruthy();
    expect(() => previewSessionsCsv("name,date\nTest,2026-10-01", "2026-10-04")).toThrow("session_json");
  });
});
