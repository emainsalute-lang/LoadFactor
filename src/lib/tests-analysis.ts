import { sessionCatalog } from "./history";
import type { ExerciseLog, WorkoutSession } from "./types";
export function jumpCategory(id: string) {
  return id === "broad-jump" ? "broad" : id === "squat-jump" ? "squat" : id === "countermovement-jump" ? "countermovement" : id === "depth-jump" ? "depth" : "vertical";
}
export function testIdentity(set: ExerciseLog, kind: string) {
  const t = set.test;
  const distanceM = t?.distanceM ?? (set.exerciseId === "10m-fly" ? 10 : null);
  const category = t?.jumpCategory ?? jumpCategory(set.exerciseId);
  const protocol = t?.protocol.trim() || "Protocol not recorded";
  const variant = kind === "jump" ? category + " / " + (t?.approach ?? "standing") + " / " + (t?.leg ?? "both") : (distanceM === null ? "distance unknown" : distanceM + " m");
  return { key: JSON.stringify([set.exerciseId, variant, protocol]), variant, protocol, distanceM, category };
}
export function sprintSegments(set: ExerciseLog) {
  const distance = set.test?.distanceM ?? (set.exerciseId === "10m-fly" ? 10 : null);
  if (!distance || !set.splitTimeSeconds) return [];
  const points = [...(set.test?.splits ?? [])];
  if (points.at(-1)?.distanceM !== distance) points.push({ distanceM: distance, seconds: set.splitTimeSeconds });
  let previousM = 0, previousSeconds = 0;
  return points.map(p => {
    const result = { fromM: previousM, toM: p.distanceM, seconds: p.seconds - previousSeconds, speedMps: (p.distanceM - previousM) / (p.seconds - previousSeconds) };
    previousM = p.distanceM; previousSeconds = p.seconds; return result;
  });
}
export function performanceTests(sessions: WorkoutSession[]) {
  const groups = new Map<string, { key: string; name: string; kind: string; variant: string; protocol: string; broad: boolean; trials: { sessionId: string; sessionTitle: string; date: string; set: ExerciseLog; value: number; speedMps: number | null }[] }>();
  for (const session of [...sessions].sort((a,b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))) {
    const catalog = sessionCatalog(session);
    for (const set of session.exercises) {
      const exercise = catalog.find(e => e.id === set.exerciseId);
      if (!exercise || exercise.kind === "strength") continue;
      const identity = testIdentity(set, exercise.kind), broad = exercise.kind === "jump" && identity.category === "broad";
      const value = exercise.kind === "sprint" ? set.splitTimeSeconds : broad ? set.test?.broadJumpCm : set.jumpHeightCm;
      if (value == null || value <= 0) continue;
      const group = groups.get(identity.key) ?? { ...identity, name: exercise.name, kind: exercise.kind, broad, trials: [] };
      group.trials.push({ sessionId: session.id, sessionTitle: session.title, date: session.date, set, value, speedMps: exercise.kind === "sprint" && identity.distanceM ? identity.distanceM / value : null });
      groups.set(identity.key, group);
    }
  }
  return [...groups.values()].map(g => ({ ...g, ...trialSummary(g.trials.map(t => t.value), g.kind === "sprint") }));
}
export function trialSummary(values: number[], lowerIsBetter: boolean) {
  if (!values.length) return { best: null, average: null, cvPercent: null };
  const average = values.reduce((a,b) => a+b,0) / values.length;
  const deviation = Math.sqrt(values.reduce((n,v) => n + (v-average)**2,0) / values.length);
  return { best: lowerIsBetter ? Math.min(...values) : Math.max(...values), average, cvPercent: values.length >= 2 && average > 0 ? deviation / average * 100 : null };
}
