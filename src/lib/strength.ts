import { dateKey, parseDate, weekStart } from "./analytics";
import { historyCatalog, sessionCatalog } from "./history";
import { muscleGroups, type Exercise, type ExerciseLog, type WorkoutSession } from "./types";
import type { StrengthSettings } from "./validation";
export const emptyStrengthSettings: StrengthSettings = { muscles: {}, alternatives: {} };
export function estimatedOneRepMax(set: Pick<ExerciseLog, "weightKg" | "reps" | "setType">): number | null {
  if ((set.setType ?? "working") !== "working" || !Number.isFinite(set.weightKg) || set.weightKg <= 0 || !Number.isInteger(set.reps) || set.reps < 1 || set.reps > 10) return null;
  return set.reps === 1 ? set.weightKg : set.weightKg * (1 + set.reps / 30);
}
export function strengthSeries(sessions: WorkoutSession[], exerciseId: string, today: string, days: number) {
  const start = parseDate(today); start.setDate(start.getDate() - days + 1); const first = dateKey(start);
  return sessions.filter(s => s.date >= first && s.date <= today && sessionCatalog(s).find(e => e.id === exerciseId)?.kind === "strength" && s.exercises.some(e => e.exerciseId === exerciseId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map(s => {
      const sets = s.exercises.filter(e => e.exerciseId === exerciseId), estimates = sets.flatMap(e => { const value = estimatedOneRepMax(e); return value === null ? [] : [value]; });
      const estimateKg = estimates.length ? Math.max(...estimates) : null;
      const bodyweightKg = s.bodyweightKg && s.bodyweightKg > 0 ? s.bodyweightKg : null;
      return { id: s.id, date: s.date, title: s.title, estimateKg, bodyweightKg, ratio: estimateKg !== null && bodyweightKg !== null ? estimateKg / bodyweightKg : null,
        workingVolumeKg: sets.filter(e => e.setType !== "warmup").reduce((n, e) => n + e.weightKg * e.reps, 0), warmupVolumeKg: sets.filter(e => e.setType === "warmup").reduce((n, e) => n + e.weightKg * e.reps, 0) };
    });
}
export function repetitionRecords(sessions: WorkoutSession[], exerciseId: string) {
  const records = new Map<number, { reps: number; weightKg: number; date: string; sessionId: string }>();
  for (const session of [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))) {
    if (sessionCatalog(session).find(e => e.id === exerciseId)?.kind !== "strength") continue;
    for (const set of session.exercises) {
      if (set.exerciseId !== exerciseId || (set.setType ?? "working") !== "working" || !Number.isFinite(set.weightKg) || set.weightKg <= 0 || !Number.isInteger(set.reps) || set.reps < 1) continue;
      if (set.weightKg >= (records.get(set.reps)?.weightKg ?? 0)) records.set(set.reps, { reps: set.reps, weightKg: set.weightKg, date: session.date, sessionId: session.id });
    }
  }
  return [...records.values()].sort((a, b) => a.reps - b.reps);
}
export function weeklyMuscleSets(sessions: WorkoutSession[], day: string, settings: StrengthSettings) {
  const counts = new Map<string, { working: number; drop: number }>([...muscleGroups, "unassigned"].map(group => [group, { working: 0, drop: 0 }]));
  for (const session of sessions.filter(s => weekStart(s.date) === weekStart(day))) {
    const catalog = sessionCatalog(session);
    for (const set of session.exercises) {
      const exercise = catalog.find(e => e.id === set.exerciseId);
      if (exercise?.kind !== "strength" || set.setType === "warmup") continue;
      const groups = settings.muscles[exercise.id] ?? exercise.muscleGroups ?? [];
      for (const group of groups.length ? [...new Set(groups)] : ["unassigned"]) {
        const count = counts.get(group)!; if (set.setType === "drop") count.drop++; else count.working++;
      }
    }
  }
  return [...counts].map(([group, count]) => ({ group, ...count, total: count.working + count.drop }));
}
export function strengthCatalog(sessions: WorkoutSession[], custom: Exercise[] = []) {
  return [...historyCatalog(sessions), ...custom].filter((e, index, all) => e.kind === "strength" && all.findIndex(x => x.id === e.id) === index);
}
