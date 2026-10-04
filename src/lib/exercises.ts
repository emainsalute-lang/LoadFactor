import type { Exercise, User } from "./types";
export const demoUser: User = {
  id: "athlete-demo", name: "Alex Morgan", sport: "Field & court athlete", bodyweightKg: 78,
  weightUnit: "kg", heightUnit: "in",
};
export const exercises: Exercise[] = [
  { id: "back-squat", name: "Back Squat", kind: "strength", muscleGroups: ["quads", "glutes"] },
  { id: "bench-press", name: "Bench Press", kind: "strength", muscleGroups: ["chest", "triceps"] },
  { id: "overhead-press", name: "Overhead Press", kind: "strength", muscleGroups: ["shoulders", "triceps"] },
  { id: "barbell-row", name: "Barbell Row", kind: "strength", muscleGroups: ["back", "biceps"] },
  { id: "romanian-deadlift", name: "Romanian Deadlift", kind: "strength", muscleGroups: ["hamstrings", "glutes"] },
  { id: "trap-bar-deadlift", name: "Trap Bar Deadlift", kind: "strength", muscleGroups: ["quads", "hamstrings", "glutes"] },
  { id: "hang-clean", name: "Hang Clean", kind: "strength", muscleGroups: ["glutes", "hamstrings", "shoulders"] },
  { id: "depth-jump", name: "Depth Jumps", kind: "jump", metricType: "vertical_jump" },
  { id: "countermovement-jump", name: "Countermovement Jump", kind: "jump" },
  { id: "squat-jump", name: "Squat Jump", kind: "jump" },
  { id: "broad-jump", name: "Broad Jump", kind: "jump" },
  { id: "sprint-test", name: "Sprint Test (configurable distance)", kind: "sprint" },
  { id: "vertical-jump", name: "Vertical Jump", kind: "jump", metricType: "vertical_jump" },
  { id: "10m-fly", name: "10m Fly Sprint", kind: "sprint", metricType: "10m_fly" },
  { id: "shuttle-run", name: "Shuttle Run", kind: "sprint", metricType: "shuttle" },
];
