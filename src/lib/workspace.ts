import { z } from "zod";
import { customExerciseSchema, sessionInputSchema, sessionSchemaFor } from "./validation";
import { createSession } from "./sessions";
import type { SessionSubmission, WorkoutSession } from "./types";
export function rebuildRecord(value: unknown): SessionSubmission | null {
  if (!value || typeof value !== "object" || !("session" in value)) return null;
  const session = value.session;
  if (!session || typeof session !== "object" || !("id" in session) || typeof session.id !== "string") return null;
  const parsed = sessionInputSchema.safeParse(session);
  if (!parsed.success) return null;
  const result = createSession(parsed.data);
  const sessionId = session.id;
  result.session.id = sessionId;
  if ("userId" in session && typeof session.userId === "string") result.session.userId = session.userId;
  if ("createdAt" in session && typeof session.createdAt === "string") result.session.createdAt = session.createdAt;
  result.metrics = result.metrics.map(metric => ({ ...metric, sessionId, userId: result.session.userId }));
  return result;
}
export const catalogSchema = z.array(customExerciseSchema).max(100);
export const templatesSchema = z.array(z.object({ id: z.string(), name: z.string().trim().min(1).max(80), input: sessionSchemaFor(() => "9999-12-31") })).max(50);
export type WorkoutTemplate = z.infer<typeof templatesSchema>[number];
export type LoggerRequest = { session: WorkoutSession; mode: "edit" | "duplicate" | "planned" };
export function moveSet<T>(items: T[], index: number, direction: number): T[] {
  const next = [...items]; const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function moveExercise<T extends { exerciseId: string }>(items: T[], exerciseId: string, direction: number): T[] {
  const ids = [...new Set(items.map(s => s.exerciseId))];
  const index = ids.indexOf(exerciseId);
  if (index < 0 || index + direction < 0 || index + direction >= ids.length) return [...items];
  return moveSet(ids, index, direction).flatMap(id => items.filter(s => s.exerciseId === id));
}
