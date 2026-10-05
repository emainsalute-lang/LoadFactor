import { describe, expect, it } from "vitest";
import { athleteProfileSchema, blankProfile, readiness, readinessSchema, testProgress, testRecordSchema, trainingLoadReport, workoutTestRecords, type TestRecord } from "./athlete-performance";
import { createSession } from "./sessions";
import { sessionSchemaFor } from "./validation";
const timestamp = "2026-10-05T12:00:00.000Z";
function test(result: number, date: string, direction: TestRecord["direction"] = "lower", extra: Partial<TestRecord> = {}): TestRecord {
  return { id: `${date}:${result}`, userId: "athlete", name: "10m Sprint", result, unit: "seconds", direction, date, protocol: "standing", notes: "", createdAt: timestamp, updatedAt: timestamp, ...extra };
}
function workout(date: string, durationMinutes: number | null = 60, sessionRpe: number | null = 8) {
  return createSession(sessionSchemaFor(() => "9999-12-31").parse({ title: "Training", date, durationMinutes, sessionRpe, notes: "", exercises: [{ exerciseId: "back-squat", weightKg: 60, reps: 5, jumpHeightCm: null, splitTimeSeconds: null, rpe: 7 }] })).session;
}
describe("Phase 1 athlete performance", () => {
  it("maps check-in extremes to transparent readiness scores", () => {
    const good = { date: "2026-10-05", sleepHours: 8, sleepQuality: 10, energy: 10, soreness: 1, stress: 1, motivation: 10 };
    expect(readiness(good)).toMatchObject({ score: 100, status: "Ready" });
    const poor = { ...good, sleepHours: 0, sleepQuality: 1, energy: 1, soreness: 10, stress: 10, motivation: 1 };
    expect(readiness(poor)).toMatchObject({ score: 0, status: "Recovery recommended" });
    expect(readiness(good).factors).toHaveLength(6);
    expect(readinessSchema.safeParse({ ...good, energy: 11 }).success).toBe(false);
    expect(readinessSchema.safeParse({ ...good, sleepHours: Number.NaN }).success).toBe(false);
  });
  it("recognizes faster sprint records, excludes regressions and treats the first result as baseline", () => {
    const group = testProgress([test(2, "2026-10-01"), test(1.8,"2026-10-02"), test(2.1,"2026-10-03"), test(1.7,"2026-10-04")])[0];
    expect(group.best?.result).toBe(1.7); expect(group.prs).toHaveLength(2);
    expect(group.prs[1].previous.result).toBe(1.8);
    expect(group.improvementPercent).toBeCloseTo(15);
    expect(group.difference).toBeCloseTo(-0.4);
    expect(testProgress([test(2,"2026-10-01")])[0].prs).toHaveLength(0);
  });
  it("recognizes higher jump records without mixing protocols or units", () => {
    const a = test(50, "2026-10-01", "higher", { name:"Vertical Jump", unit:"cm" });
    const b = { ...a, id:"b", date:"2026-10-02", result:55 };
    const groups = testProgress([a,b,{...b,id:"c",result:100,protocol:"approach"},{...b,id:"d",unit:"inches",result:22}]);
    expect(groups).toHaveLength(3); expect(groups[0].prs).toHaveLength(1);
    expect(groups[0].improvementPercent).toBe(10);
  });
  it("does not award bodyweight personal records", () => {
    const group = testProgress([test(70,"2026-10-01","neutral",{name:"Bodyweight",unit:"kg"}),test(72,"2026-10-02","neutral",{name:"Bodyweight",unit:"kg"})])[0];
    expect(group.best).toBeNull(); expect(group.prs).toHaveLength(0); expect(group.improvementPercent).toBeNull();
  });
  it("uses session effort, excludes future sessions and preserves missing load", () => {
    const report = trainingLoadReport([workout("2026-10-05"),workout("2026-10-04",null,null),workout("2026-09-25",30,5),workout("2026-10-06",100,10)],"2026-10-05");
    expect(report.todayLoad).toBe(480); expect(report.weekLoad).toBe(480); expect(report.previousWeekLoad).toBe(150);
    expect(report.missingLoad).toBe(1); expect(report.sessions).toBe(2); expect(report.restDays).toBe(5);
    expect(report.averageRpe).toBe(8); expect(report.streak).toBe(2);
    expect(report.points.find(p => p.date === "2026-10-04")?.load).toBeNull();
    expect(trainingLoadReport([workout("2026-10-05",null,null)],"2026-10-05").weekLoad).toBeNull();
    expect(trainingLoadReport([],"2026-10-05").weekLoad).toBe(0);
  });
  it("derives strength records from real sets and separates repetition protocols", () => {
    const a = workout("2026-10-01"), b = workout("2026-10-02"); b.exercises[0].weightKg=70;
    const records = workoutTestRecords([a,b],"athlete");
    expect(records.every(r => r.userId === "athlete")).toBe(true);
    expect(testProgress(records)[0].best?.result).toBe(70);
    b.exercises[0].reps=3; expect(testProgress(workoutTestRecords([a,b],"athlete"))).toHaveLength(2);
    b.exercises[0].setType="warmup"; expect(workoutTestRecords([b],"athlete")).toHaveLength(0);
  });
  it("validates names, units, whole reps, dates and finite measurements", () => {
    expect(testRecordSchema.safeParse(test(Number.NaN,"2026-10-05")).success).toBe(false);
    expect(testRecordSchema.safeParse(test(-1,"2026-10-05")).success).toBe(false);
    expect(testRecordSchema.safeParse(test(2,"2026-02-30")).success).toBe(false);
    expect(testRecordSchema.safeParse(test(2,"2026-10-05","higher")).success).toBe(false);
    expect(testRecordSchema.safeParse(test(2.5,"2026-10-05","higher",{name:"Push-ups",unit:"reps"})).success).toBe(false);
    expect(athleteProfileSchema.safeParse({...blankProfile,fullName:"Ganza",heightCm: -1}).success).toBe(false);
    expect(athleteProfileSchema.safeParse({...blankProfile,fullName:"Ganza",birthDate:"2099-01-01"}).success).toBe(false);
    expect(athleteProfileSchema.safeParse({...blankProfile,fullName:"Ganza",photoUrl:"javascript:alert(1)"}).success).toBe(false);
  });
});
