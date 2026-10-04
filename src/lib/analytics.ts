import type { HeightUnit, PerformanceMetric, WeightUnit, WorkoutSession } from "./types";
export const LB_PER_KG = 2.2046226218;
export function weightFromKg(value: number, unit: WeightUnit) { return unit === "lbs" ? value * LB_PER_KG : value; }
export function weightToKg(value: number, unit: WeightUnit) { return unit === "lbs" ? value / LB_PER_KG : value; }
export function heightFromCm(value: number, unit: HeightUnit) { return unit === "in" ? value / 2.54 : value; }
export function heightToCm(value: number, unit: HeightUnit) { return unit === "in" ? value * 2.54 : value; }
export function sessionTrainingLoad(session: Pick<WorkoutSession, "durationMinutes" | "sessionRpe">): number | null {
  const duration = session.durationMinutes, rpe = session.sessionRpe;
  return typeof duration === "number" && Number.isFinite(duration) && duration > 0 && duration <= 1440 && typeof rpe === "number" && Number.isFinite(rpe) && rpe >= 0 && rpe <= 10 ? duration * rpe : null;
}
export function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
export function parseDate(value: string) { return new Date(value + "T12:00:00"); }
export function weekStart(value: string) {
  const day = parseDate(value);
  day.setDate(day.getDate() - (day.getDay() + 6) % 7);
  return dateKey(day);
}
export function summarize(sessions: WorkoutSession[], metrics: PerformanceMetric[], today: string) {
  const jumps = metrics.filter(m => m.type === "vertical_jump").map(m => m.value);
  const sprints = metrics.filter(m => m.type === "10m_fly").map(m => m.value);
  const current = sessions.filter(s => weekStart(s.date) === weekStart(today));
  const sets = current.flatMap(s => s.exercises);
  return {
    verticalPr: jumps.length ? Math.max(...jumps) : null,
    sprintPr: sprints.length ? Math.min(...sprints) : null,
    weeklyVolume: current.reduce((sum, s) => sum + s.volumeKg, 0),
    averageRpe: sets.length ? sets.reduce((sum, s) => sum + s.rpe, 0) / sets.length : null,
    weeklySessions: current.length,
  };
}
export function chartData(sessions: WorkoutSession[], metrics: PerformanceMetric[], today: string, days: number) {
  const end = parseDate(today);
  const start = parseDate(today);
  start.setDate(start.getDate() - days + 1);
  const startKey = dateKey(start);
  const jumps = new Map<string, number>();
  for (const m of metrics) {
    if (m.type === "vertical_jump" && m.recordedAt >= startKey && m.recordedAt <= today)
      jumps.set(m.recordedAt, Math.max(jumps.get(m.recordedAt) ?? 0, m.value));
  }
  const volume = new Map<string, number>();
  const cursor = parseDate(weekStart(startKey));
  while (cursor <= end) { volume.set(dateKey(cursor), 0); cursor.setDate(cursor.getDate() + 7); }
  for (const s of sessions) {
    if (s.date >= startKey && s.date <= today) {
      const key = weekStart(s.date);
      volume.set(key, (volume.get(key) ?? 0) + s.volumeKg);
    }
  }
  const label = (date: string) => parseDate(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return {
    jumps: [...jumps].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, label: label(date), value })),
    volume: [...volume].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, label: label(date), value })),
  };
}
