import { dateKey } from "./analytics";
import { createSession } from "./sessions";
import type { PerformanceMetric, WorkoutSession } from "./types";
export function makeDemoData(today: string) {
  const sessions: WorkoutSession[] = [];
  const metrics: PerformanceMetric[] = [];
  let sequence = 0;
  for (let i = 0; i < 24; i++) {
    const date = new Date(today + "T12:00:00");
    date.setDate(date.getDate() - (23 - i) * 2);
    const jump = 66 + i * 0.43 + Math.sin(i * 1.9) * 1.9;
    const result = createSession({ customExercises: [], tags: [], bodyweightKg: 78,
      title: i % 3 === 0 ? "Speed & reactive power" : i % 3 === 1 ? "Lower body strength" : "Explosive full body",
      date: dateKey(date), notes: "Demo training session.",
      exercises: [
        ...[1, 2, 3].map(() => ({ exerciseId: "trap-bar-deadlift", weightKg: 95 + Math.floor(i / 4) * 5, reps: 5, jumpHeightCm: null, splitTimeSeconds: null, rpe: 6 + i % 3 })),
        { exerciseId: "vertical-jump", weightKg: 0, reps: 3, jumpHeightCm: Math.round(jump * 10) / 10, splitTimeSeconds: null, rpe: 5 + i % 3 },
        { exerciseId: "10m-fly", weightKg: 0, reps: 1, jumpHeightCm: null, splitTimeSeconds: Math.round((1.18 - i * 0.003 + Math.sin(i) * 0.015) * 100) / 100, rpe: 7 },
      ],
    }, () => "demo-" + sequence++);
    sessions.push(result.session);
    metrics.push(...result.metrics);
  }
  return { sessions, metrics };
}
