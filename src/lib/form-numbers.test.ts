import { describe, expect, it } from "vitest";
import { z } from "zod";
import { formIssueMessage, parseFormNumber, parseSprintSplits } from "./form-numbers";

describe("numeric form input", () => {
  it("keeps optional numbers empty and uses explicit defaults only for blank input", () => {
    expect(parseFormNumber("", "Bodyweight")).toBeNull();
    expect(parseFormNumber(" ", "Weight", 0)).toBe(0);
    expect(parseFormNumber("12.5", "Weight")).toBe(12.5);
  });
  it.each(["NaN", "undefined", "12,5", "60kg", "Infinity"])("rejects invalid numeric drafts without silently replacing them: %s", value => {
    expect(() => parseFormNumber(value, "Set 1 weight", 0)).toThrow("Set 1 weight: enter a valid number");
  });
  it("accepts optional empty splits and valid decimal splits", () => {
    expect(parseSprintSplits("  ")).toEqual([]);
    expect(parseSprintSplits("10:1.8, 20:3.2")).toEqual([{ distanceM: 10, seconds: 1.8 }, { distanceM: 20, seconds: 3.2 }]);
  });
  it.each(["10", "10:", ":1.8", "10:abc", "10:1.8,", "0:1.8", "10:Infinity", "10:1:8"])("rejects malformed splits without passing NaN to validation: %s", value => {
    expect(() => parseSprintSplits(value)).toThrow("distance:seconds");
  });
  it("identifies the set and field for invalid numbers", () => {
    const result = z.object({ exercises: z.array(z.object({ weightKg: z.number() })) }).safeParse({ exercises: [{ weightKg: NaN }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(formIssueMessage(result.error.issues[0])).toBe("Set 1 · Weight: Enter a valid number. Use a decimal point, for example 12.5.");
  });
});
