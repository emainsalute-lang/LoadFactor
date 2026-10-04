import { z } from "zod";
import { dateKey, parseDate, sessionTrainingLoad } from "./analytics";
import { muscleGroups, type WorkoutSession } from "./types";
import { performanceTests } from "./tests-analysis";
import { estimatedOneRepMax } from "./strength";
const rating = z.number().int().min(1).max(5).nullable().default(null);
export function wellnessSchemaFor(today: () => string = () => dateKey(new Date())) {
  return z.object({
    date: z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/).refine(value => {
      const date = new Date(value + "T12:00:00Z");
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= today();
    }, "Choose a valid check-in date that is not in the future."),
    sleepHours: z.number().finite().min(0).max(24).nullable().default(null),
    sleepQuality: rating, soreness: rating, stress: rating, mood: rating,
    muscleSoreness: z.partialRecord(z.enum(muscleGroups), z.number().int().min(1).max(5)).default({}),
    bodyweightKg: z.number().finite().min(1).max(500).nullable().default(null),
    notes: z.string().trim().max(1000).default(""),
  }).refine(value => value.sleepHours !== null || value.sleepQuality !== null || value.soreness !== null || value.stress !== null || value.mood !== null || value.bodyweightKg !== null || Object.keys(value.muscleSoreness).length > 0 || !!value.notes, "Record at least one wellness field.");
}
export const wellnessSchema = wellnessSchemaFor();
export const wellnessHistorySchema = z.array(wellnessSchemaFor(() => "9999-12-31")).max(10000).refine(entries => new Set(entries.map(e => e.date)).size === entries.length, "Only one check-in per date.");
export type WellnessCheckIn = z.infer<typeof wellnessSchema>;
export function bodyweightHistory(checkIns: WellnessCheckIn[], sessions: WorkoutSession[]) {
  const points = new Map<string, { date: string; bodyweightKg: number; source: string }>();
  for (const session of [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)))
    if (session.bodyweightKg) points.set(session.date, { date: session.date, bodyweightKg: session.bodyweightKg, source: "Workout bodyweight (latest session)" });
  for (const checkIn of checkIns) if (checkIn.bodyweightKg !== null) points.set(checkIn.date, { date: checkIn.date, bodyweightKg: checkIn.bodyweightKg, source: "Daily check-in" });
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function wellnessComparison(checkIns: WellnessCheckIn[], sessions: WorkoutSession[], today: string, days: number, testKey = "", strengthExerciseId = "") {
  const start = parseDate(today); start.setDate(start.getDate() - days + 1);
  const first = dateKey(start), tests = performanceTests(sessions), test = tests.find(t => t.key === testKey);
  const dates: string[] = [], cursor = parseDate(first);
  for (let day = 0; day < days; day++) { dates.push(dateKey(cursor)); cursor.setDate(cursor.getDate() + 1); }
  return dates.map(date => {
    const checkIn = checkIns.find(c => c.date === date), workouts = sessions.filter(s => s.date === date);
    const loads = workouts.map(sessionTrainingLoad).filter((v): v is number => v !== null);
    const trials = test?.trials.filter(t => t.date === date) ?? [];
    const estimates = strengthExerciseId ? workouts.flatMap(s => s.exercises).filter(s => s.exerciseId === strengthExerciseId).map(estimatedOneRepMax).filter((v): v is number => v !== null) : [];
    return { date, sleepHours: checkIn?.sleepHours ?? null, sleepQuality: checkIn?.sleepQuality ?? null, soreness: checkIn?.soreness ?? null, stress: checkIn?.stress ?? null, mood: checkIn?.mood ?? null,
      sessions: workouts.length, volumeKg: workouts.length ? workouts.reduce((n, s) => n + s.volumeKg, 0) : null,
      load: loads.length ? loads.reduce((n, load) => n + load, 0) : null, loadSessions: loads.length,
      performance: trials.length ? (test?.kind === "sprint" ? Math.min(...trials.map(t => t.value)) : Math.max(...trials.map(t => t.value))) : null,
      estimateKg: estimates.length ? Math.max(...estimates) : null,
    };
  });
}
