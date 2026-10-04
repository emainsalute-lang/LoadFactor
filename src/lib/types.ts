export type WeightUnit = "kg" | "lbs";
export type HeightUnit = "cm" | "in";
export type ExerciseKind = "strength" | "jump" | "sprint";
export const muscleGroups = ["quads", "hamstrings", "glutes", "back", "chest", "shoulders", "biceps", "triceps", "core", "calves"] as const;
export type MuscleGroup = typeof muscleGroups[number];
export type SetType = "working" | "warmup" | "drop";
export interface User {
  id: string;
  name: string;
  sport: string;
  bodyweightKg?: number | null;
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
}
export interface Exercise {
  id: string;
  name: string;
  kind: ExerciseKind;
  muscleGroups?: MuscleGroup[];
  metricType?: PerformanceMetric["type"];
}
export interface ExerciseLog {
  id: string;
  exerciseId: string;
  videoUrl?: string | null;
  setNumber: number;
  setType?: SetType;
  superset?: string | null;
  dropGroup?: string | null;
  tempo?: string | null;
  pauseSeconds?: number | null;
  weightKg: number;
  reps: number;
  jumpHeightCm: number | null;
  splitTimeSeconds: number | null;
  rpe: number;
  test?: {
    jumpCategory: "countermovement" | "squat" | "depth" | "vertical" | "broad";
    approach: "standing" | "approach";
    leg: "both" | "left" | "right";
    broadJumpCm: number | null;
    distanceM: number | null;
    splits: { distanceM: number; seconds: number }[];
    protocol: string;
  } | null;
}
export interface WorkoutSession {
  durationMinutes?: number | null;
  sessionRpe?: number | null;
  sessionLoad?: number | null;
  plannedWorkoutId?: string | null;
  id: string;
  userId: string;
  date: string;
  title: string;
  notes: string;
  tags?: string[];
  bodyweightKg?: number | null;
  exercises: ExerciseLog[];
  customExercises?: Exercise[];
  volumeKg: number;
  averageRpe: number;
  createdAt: string;
}
export interface PerformanceMetric {
  id: string;
  userId: string;
  sessionId: string;
  exerciseLogId: string;
  type: "vertical_jump" | "10m_fly" | "shuttle";
  value: number;
  unit: "cm" | "seconds";
  recordedAt: string;
}
export interface SessionSubmission {
  session: WorkoutSession;
  metrics: PerformanceMetric[];
}
