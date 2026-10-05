import { z } from "zod";
import { planningDate, shiftDate } from "./planning";
import { sessionTrainingLoad } from "./analytics";
import type { WorkoutSession } from "./types";
import { performanceTests } from "./tests-analysis";
import { sessionCatalog } from "./history";

export const sports = ["Basketball", "Football/Soccer", "American Football", "Volleyball", "Running", "Strength Training", "Other"] as const;
const text = z.string().trim().max(300);
export const athleteProfileSchema = z.object({
  fullName: text.min(1), photoUrl: z.string().max(2000).refine(v => { if (!v) return true; try { return new URL(v).protocol === "https:"; } catch { return false; } }, "Use an HTTPS photo URL."),
  sport: z.enum(sports), position: text, birthDate: planningDate.or(z.literal("")),
  heightCm: z.number().finite().min(30).max(300).nullable(), weightKg: z.number().finite().min(1).max(500).nullable(),
  team: text, classYear: z.number().int().min(1900).max(2200).nullable(),
  experience: z.enum(["Beginner", "Intermediate", "Advanced"]), primaryGoal: text, secondaryGoals: text,
}).refine(v => !v.birthDate || v.birthDate <= new Date().toISOString().slice(0, 10), "Birth date cannot be in the future.");
export type AthleteProfile = z.infer<typeof athleteProfileSchema>;
export const blankProfile: AthleteProfile = { fullName: "", photoUrl: "", sport: "Other", position: "", birthDate: "", heightCm: null, weightKg: null, team: "", classYear: null, experience: "Beginner", primaryGoal: "", secondaryGoals: "" };
export const testDefinitions = [
  ["Vertical Jump", "cm", "higher"], ["Standing Broad Jump", "cm", "higher"],
  ["10m Sprint", "seconds", "lower"], ["20m Sprint", "seconds", "lower"], ["40-yard Dash", "seconds", "lower"],
  ["Agility Test", "seconds", "lower"], ["Push-ups", "reps", "higher"], ["Pull-ups", "reps", "higher"],
  ["Bench Press", "kg", "higher"], ["Squat", "kg", "higher"], ["Deadlift", "kg", "higher"],
  ["Beep Test", "level", "higher"], ["Bodyweight", "kg", "neutral"],
] as const;
export const testRecordSchema = z.object({ id: z.string().min(1), userId: z.string().min(1), name: text.min(1),
  result: z.number().finite().positive().max(100000), unit: z.enum(["cm", "inches", "seconds", "reps", "kg", "lbs", "level", "points"]),
  direction: z.enum(["higher", "lower", "neutral"]), date: planningDate, notes: z.string().trim().max(1000),
  protocol: text, createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).superRefine((v, ctx) => {
  const definition = testDefinitions.find(d => d[0] === v.name);
  if (definition && (v.direction !== definition[2] || v.unit !== definition[1])) ctx.addIssue({ code: "custom", message: "Use the standard test's unit and result direction." });
  if (v.unit === "reps" && !Number.isInteger(v.result)) ctx.addIssue({ code: "custom", message: "Repetitions must be whole numbers." });
});
export type TestRecord = z.infer<typeof testRecordSchema>;
export function workoutTestRecords(sessions: WorkoutSession[], userId: string): TestRecord[] {
  const records: TestRecord[] = performanceTests(sessions).flatMap(test => test.trials.map(trial => ({
    id: `workout:${trial.sessionId}:${trial.set.id}`, userId, name: test.name, result: trial.value,
    unit: test.kind === "sprint" ? "seconds" as const : "cm" as const,
    direction: test.kind === "sprint" ? "lower" as const : "higher" as const,
    date: trial.date, notes: trial.sessionTitle, protocol: `Workout protocol: ${test.key}`,
    createdAt: sessions.find(s => s.id === trial.sessionId)!.createdAt, updatedAt: sessions.find(s => s.id === trial.sessionId)!.createdAt,
  })));
  for (const session of sessions) {
    const catalog = sessionCatalog(session);
    for (const set of session.exercises) {
      const exercise = catalog.find(e => e.id === set.exerciseId);
      if (exercise?.kind !== "strength" || set.setType === "warmup" || set.weightKg <= 0 || set.reps <= 0) continue;
      records.push({ id: `workout:${session.id}:${set.id}`, userId, name: exercise.name, result: set.weightKg, unit: "kg", direction: "higher",
        date: session.date, notes: session.title, protocol: `Workout load at ${set.reps} reps${set.tempo ? ` · tempo ${set.tempo}` : ""}${set.pauseSeconds ? ` · pause ${set.pauseSeconds}s` : ""}`,
        createdAt: session.createdAt, updatedAt: session.createdAt });
    }
  }
  return records;
}
export const readinessSchema = z.object({ date: planningDate, sleepHours: z.number().finite().min(0).max(24),
  sleepQuality: z.number().int().min(1).max(10), energy: z.number().int().min(1).max(10),
  soreness: z.number().int().min(1).max(10), stress: z.number().int().min(1).max(10), motivation: z.number().int().min(1).max(10),
});
export type ReadinessCheckIn = z.infer<typeof readinessSchema>;
export function readiness(checkIn: ReadinessCheckIn) {
  const positive = (v: number) => (v - 1) / 9 * 100;
  const factors = [
    { name: "Sleep duration", score: Math.min(checkIn.sleepHours / 8, 1) * 100 },
    { name: "Sleep quality", score: positive(checkIn.sleepQuality) }, { name: "Energy", score: positive(checkIn.energy) },
    { name: "Muscle recovery", score: 100 - positive(checkIn.soreness) }, { name: "Low stress", score: 100 - positive(checkIn.stress) },
    { name: "Motivation", score: positive(checkIn.motivation) },
  ];
  const score = Math.round(factors.reduce((sum, f) => sum + f.score, 0) / factors.length);
  return { score, factors, status: score >= 80 ? "Ready" : score >= 60 ? "Moderate" : score >= 40 ? "Fatigued" : "Recovery recommended" };
}
export function testProgress(records: TestRecord[]) {
  const groups = new Map<string, TestRecord[]>();
  for (const r of records) { const key = JSON.stringify([r.name, r.unit, r.direction, r.protocol]); groups.set(key, [...(groups.get(key) ?? []), r]); }
  return [...groups.entries()].map(([key, items]) => {
    const results = items.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    const first = results[0], latest = results.at(-1)!, previous = results.at(-2);
    let best = first;
    const prs: { record: TestRecord; previous: TestRecord; improvement: number }[] = [];
    for (const r of results.slice(1)) if (r.direction !== "neutral" && (r.direction === "lower" ? r.result < best.result : r.result > best.result)) {
      prs.push({ record: r, previous: best, improvement: Math.abs(r.result - best.result) }); best = r;
    }
    const sign = latest.direction === "lower" ? -1 : 1;
    return { key, results, latest, previous, best: latest.direction === "neutral" ? null : best, prs,
      difference: previous ? latest.result - previous.result : null,
      improvementPercent: results.length > 1 && latest.direction !== "neutral" ? sign * (latest.result - first.result) / first.result * 100 : null };
  });
}
export function trainingLoadReport(sessions: WorkoutSession[], today: string) {
  const eligible = sessions.filter(s => s.date <= today);
  const points = Array.from({ length: 28 }, (_, i) => {
    const date = shiftDate(today, i - 27), day = eligible.filter(s => s.date === date);
    const measured = day.map(sessionTrainingLoad).filter((n): n is number => n !== null);
    return { date, load: !day.length ? 0 : measured.length ? measured.reduce((a,b) => a+b,0) : null, sessions: day.length, measured: measured.length };
  });
  const sum = (rows: typeof points) => rows.some(p => p.sessions > 0) && !rows.some(p => p.measured > 0) ? null : rows.reduce((s,p) => s + (p.load ?? 0),0);
  const recent = eligible.filter(s => s.date >= shiftDate(today, -6));
  const rpes = recent.map(s => s.sessionRpe).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const days = new Set(recent.map(s => s.date));
  let streak = 0, cursor = days.has(today) ? today : shiftDate(today, -1);
  const allDays = new Set(eligible.map(s => s.date));
  while (allDays.has(cursor)) { streak++; cursor = shiftDate(cursor, -1); }
  return { points, todayLoad: points.at(-1)!.load, weekLoad: sum(points.slice(-7)), previousWeekLoad: sum(points.slice(-14,-7)),
    sessions: recent.length, restDays: 7 - days.size, averageRpe: rpes.length ? rpes.reduce((a,b) => a+b,0)/rpes.length : null,
    missingLoad: recent.filter(s => sessionTrainingLoad(s) === null).length,
    previousMissingLoad: eligible.filter(s => s.date >= shiftDate(today,-13) && s.date < shiftDate(today,-6) && sessionTrainingLoad(s) === null).length, streak };
}
