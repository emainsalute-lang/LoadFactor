import { z } from "zod";
import { exercises } from "./exercises";
import type { Exercise, WorkoutSession } from "./types";
export const monthSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);
const optionalDate = z.string().refine(value => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Choose a valid date.");
export const historyFilterSchema = z.object({
  query: z.string().max(200).default(""), exerciseId: z.string().max(100).default(""),
  category: z.enum(["", "strength", "jump", "sprint"]).default(""),
  from: optionalDate.default(""), to: optionalDate.default(""), tag: z.string().trim().toLowerCase().max(24).default(""),
}).refine(f => !f.from || !f.to || f.from <= f.to, "Start date must be on or before end date.");
export type HistoryFilter = z.infer<typeof historyFilterSchema>;
export const emptyFilter: HistoryFilter = { query: "", exerciseId: "", category: "", from: "", to: "", tag: "" };
export const savedFiltersSchema = z.array(z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(60), filter: historyFilterSchema })).max(20).refine(items => new Set(items.map(i => i.id)).size === items.length, "Duplicate saved filter IDs.");
export type SavedHistoryFilter = z.infer<typeof savedFiltersSchema>[number];
export function sessionCatalog(session: WorkoutSession): Exercise[] { return [...exercises, ...(session.customExercises ?? [])]; }
export function historyCatalog(sessions: WorkoutSession[]) {
  return [...exercises, ...sessions.flatMap(s => s.customExercises ?? [])].filter((e, i, all) => all.findIndex(x => x.id === e.id) === i);
}
export function filterHistory(sessions: WorkoutSession[], filter: HistoryFilter) {
  const query = filter.query.trim().toLowerCase();
  return sessions.filter(s => {
    const catalog = sessionCatalog(s);
    return (!query || (s.title + " " + s.notes).toLowerCase().includes(query)) &&
      (!filter.exerciseId || s.exercises.some(e => e.exerciseId === filter.exerciseId)) &&
      (!filter.category || s.exercises.some(e => catalog.find(x => x.id === e.exerciseId)?.kind === filter.category)) &&
      (!filter.from || s.date >= filter.from) && (!filter.to || s.date <= filter.to) &&
      (!filter.tag || (s.tags ?? []).includes(filter.tag));
  }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
export function monthDays(month: string): (string | null)[] {
  monthSchema.parse(month);
  const first = new Date(month + "-01T12:00:00Z"), offset = (first.getUTCDay() + 6) % 7;
  const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  return Array.from({ length: 42 }, (_, index) => index < offset || index >= offset + last.getUTCDate() ? null : month + "-" + String(index - offset + 1).padStart(2, "0"));
}
export function shiftMonth(month: string, offset: number): string {
  monthSchema.parse(month); const date = new Date(month + "-01T12:00:00Z"); date.setUTCMonth(date.getUTCMonth() + offset);
  const next = date.toISOString().slice(0, 7); return monthSchema.safeParse(next).success ? next : month;
}
export function sessionTotals(session: WorkoutSession) {
  const sets = session.exercises;
  const jumps = sets.filter(s => ["vertical-jump", "depth-jump"].includes(s.exerciseId) && s.jumpHeightCm !== null).map(s => s.jumpHeightCm!);
  const sprints = sets.filter(s => s.exerciseId === "10m-fly" && s.splitTimeSeconds !== null).map(s => s.splitTimeSeconds!);
  return { sets: sets.length, reps: sets.reduce((n, s) => n + s.reps, 0), volumeKg: sets.reduce((n, s) => n + s.weightKg * s.reps, 0), averageRpe: sets.length ? sets.reduce((n, s) => n + s.rpe, 0) / sets.length : null, jumpCm: jumps.length ? Math.max(...jumps) : null, sprintSeconds: sprints.length ? Math.min(...sprints) : null };
}
export function monthlySummary(sessions: WorkoutSession[], month: string) {
  monthSchema.parse(month); const matching = sessions.filter(s => s.date.startsWith(month + "-"));
  const sets = matching.flatMap(s => s.exercises);
  return { sessions: matching.length, trainingDays: new Set(matching.map(s => s.date)).size, sets: sets.length, volumeKg: sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0), averageRpe: sets.length ? sets.reduce((sum, s) => sum + s.rpe, 0) / sets.length : null };
}
