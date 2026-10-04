import { setDetailSchema, type SessionInput } from "./validation";
import type { PerformanceMetric, SessionSubmission } from "./types";
import { exercises, demoUser } from "./exercises";
import { sessionTrainingLoad } from "./analytics";
type SetDetails = "setType" | "superset" | "dropGroup" | "tempo" | "pauseSeconds" | "test" | "videoUrl";
type BuildInput = Omit<SessionInput, "exercises" | "bodyweightKg" | "plannedWorkoutId" | "durationMinutes" | "sessionRpe"> & {
  durationMinutes?: number | null;
  sessionRpe?: number | null;
  plannedWorkoutId?: string | null;
  bodyweightKg?: number | null;
  exercises: (Omit<SessionInput["exercises"][number], SetDetails> & Partial<Pick<SessionInput["exercises"][number], SetDetails>>)[];
};
export function createSession(input: BuildInput, id: () => string = () => crypto.randomUUID()): SessionSubmission {
  const sessionId = id();
  const count = new Map<string, number>();
  const logs = input.exercises.map(set => {
    const setNumber = (count.get(set.exerciseId) ?? 0) + 1;
    count.set(set.exerciseId, setNumber);
    return { ...set, ...setDetailSchema.parse(set), id: id(), setNumber };
  });
  const metrics: PerformanceMetric[] = [];
  for (const log of logs) {
    const exercise = exercises.find(e => e.id === log.exerciseId);
    const value = exercise?.kind === "jump" ? log.jumpHeightCm : log.splitTimeSeconds;
    if (exercise?.metricType && value !== null && (!log.test || (exercise.kind === "jump" ? log.test.jumpCategory === (exercise.id === "depth-jump" ? "depth" : "vertical") && log.test.approach === "standing" && log.test.leg === "both" : exercise.id !== "10m-fly" || log.test.distanceM === 10)))
      metrics.push({
        id: id(), userId: demoUser.id, sessionId, exerciseLogId: log.id,
        type: exercise.metricType, value,
        unit: exercise.kind === "jump" ? "cm" : "seconds", recordedAt: input.date,
      });
  }
  return {
    session: {
      durationMinutes: input.durationMinutes ?? null, sessionRpe: input.sessionRpe ?? null, sessionLoad: sessionTrainingLoad(input),
      plannedWorkoutId: input.plannedWorkoutId ?? null,
      id: sessionId, userId: demoUser.id, title: input.title, date: input.date, notes: input.notes, tags: input.tags, bodyweightKg: input.bodyweightKg,
      customExercises: input.customExercises, exercises: logs, volumeKg: logs.reduce((sum, set) => sum + set.weightKg * set.reps, 0),
      averageRpe: logs.reduce((sum, set) => sum + set.rpe, 0) / logs.length,
      createdAt: new Date().toISOString(),
    },
    metrics,
  };
}
