import { z } from "zod";
import { sessionSchemaFor } from "./validation";
import { estimatedOneRepMax } from "./strength";
import type { WorkoutSession } from "./types";
import { exercises } from "./exercises";

export const planningDate = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Choose a valid date.");
const id = z.string().min(1).max(100);
const ruleSchema = z.object({
  mode: z.enum(["none", "load", "reps"]), increment: z.number().finite().min(0).max(100),
  deloadEvery: z.number().int().min(0).max(52), deloadPercent: z.number().finite().min(0).max(90),
});
export const planSchema = z.object({
  id, date: planningDate, originalDate: planningDate, blockId: id.nullable(), deload: z.boolean(),
  templateName: z.string().max(80), input: sessionSchemaFor(() => "9999-12-31"),
}).refine(plan => plan.date === plan.input.date, "Planned date and target date must match.");
export const goalSchema = z.object({
  id, name: z.string().trim().min(1).max(80), metric: z.enum(["sessions", "volume", "load", "e1rm"]),
  exerciseId: z.string().max(100), start: planningDate, end: planningDate,
  baseline: z.number().finite().min(0), target: z.number().finite().positive(), minReps: z.number().int().min(1).max(1000),
}).refine(goal => goal.start <= goal.end && goal.target > goal.baseline, "Set a valid date range and a target above baseline.")
  .refine(goal => !["load", "e1rm"].includes(goal.metric) || !!goal.exerciseId, "Select an exercise for a strength goal.");
export const planningSchema = z.object({
  documents: z.array(z.object({
    id, date: planningDate, title: z.string().trim().min(1).max(80),
    objective: z.string().trim().max(1000), warmup: z.string().trim().max(2000),
    cooldown: z.string().trim().max(2000), notes: z.string().trim().max(3000),
    rows: z.array(z.object({
      id, name: z.string().trim().min(1).max(80),
      sets: z.number().int().min(1).max(100), reps: z.string().trim().min(1).max(80),
      load: z.string().trim().max(80), rest: z.string().trim().max(80),
      instructions: z.string().trim().max(500),
    })).min(1).max(100),
  })).max(500).default([]),
  plans: z.array(planSchema).max(500),
  blocks: z.array(z.object({ id, name: z.string().trim().min(1).max(80), start: planningDate, weeks: z.number().int().min(1).max(52), rule: ruleSchema })).max(50),
  goals: z.array(goalSchema).max(100),
}).superRefine((planning, ctx) => {
  for (const [key, items] of [["plans", planning.plans], ["blocks", planning.blocks], ["goals", planning.goals], ["documents", planning.documents]] as const)
    if (new Set(items.map(item => item.id)).size !== items.length) ctx.addIssue({ code: "custom", path: [key], message: "Duplicate IDs." });
  for (const plan of planning.plans) if (plan.blockId && !planning.blocks.some(block => block.id === plan.blockId))
    ctx.addIssue({ code: "custom", path: ["plans"], message: "Unknown training block." });
});
export type Planning = z.infer<typeof planningSchema>;
export type WorkoutDocument = Planning["documents"][number];
export type PlannedWorkout = Planning["plans"][number];
export type TrainingGoal = Planning["goals"][number];
export const emptyPlanning: Planning = { plans: [], blocks: [], goals: [], documents: [] };
export function shiftDate(date: string, days: number) {
  const value = new Date(date + "T12:00:00Z"); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function blockPlans(template: PlannedWorkout["input"], templateName: string, block: Planning["blocks"][number], weekdays: number[], newId: () => string = () => crypto.randomUUID()): PlannedWorkout[] {
  const plans: PlannedWorkout[] = []; let progressiveWeeks = 0;
  const strengthIds = new Set([...exercises, ...template.customExercises].filter(exercise => exercise.kind === "strength").map(exercise => exercise.id));
  for (let week = 0; week < block.weeks; week++) {
    const deload = block.rule.deloadEvery > 0 && (week + 1) % block.rule.deloadEvery === 0;
    for (let day = 0; day < 7; day++) {
      const date = shiftDate(block.start, week * 7 + day);
      if (!weekdays.includes(new Date(date + "T12:00:00Z").getUTCDay())) continue;
      const input = { ...template, plannedWorkoutId: null, date, exercises: template.exercises.map(set => !strengthIds.has(set.exerciseId) ? { ...set } : ({ ...set,
        weightKg: Math.max(0, Math.min(1500, (set.weightKg + (block.rule.mode === "load" ? progressiveWeeks * block.rule.increment : 0)) * (deload ? 1 - block.rule.deloadPercent / 100 : 1))),
        reps: Math.min(1000, set.reps + (block.rule.mode === "reps" ? Math.floor(progressiveWeeks * block.rule.increment) : 0)),
      })) };
      plans.push({ id: newId(), date, originalDate: date, blockId: block.id, deload, templateName, input });
    }
    if (!deload) progressiveWeeks++;
  }
  return plans;
}
export function completedPlan(plan: PlannedWorkout, sessions: WorkoutSession[]) {
  return sessions.filter(session => session.plannedWorkoutId === plan.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
export function comparePlan(plan: PlannedWorkout, session: WorkoutSession) {
  return [...new Set([...plan.input.exercises, ...session.exercises].map(set => set.exerciseId))].map(exerciseId => {
    const targets = plan.input.exercises.filter(set => set.exerciseId === exerciseId), actual = session.exercises.filter(set => set.exerciseId === exerciseId);
    const totals = (sets: { reps: number; weightKg: number }[]) => ({ sets: sets.length, reps: sets.reduce((sum, set) => sum + set.reps, 0), volumeKg: sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0) });
    return { exerciseId, targets, actual, planned: totals(targets), completed: totals(actual) };
  });
}
export function goalProgress(goal: TrainingGoal, sessions: WorkoutSession[]) {
  const selected = sessions.filter(session => session.date >= goal.start && session.date <= goal.end);
  const sets = selected.flatMap(session => session.exercises).filter(set => !goal.exerciseId || set.exerciseId === goal.exerciseId);
  const value = goal.metric === "sessions" ? selected.filter(session => !goal.exerciseId || session.exercises.some(set => set.exerciseId === goal.exerciseId)).length
    : goal.metric === "volume" ? sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0)
    : Math.max(0, ...sets.filter(set => (set.setType ?? "working") === "working" && set.reps >= goal.minReps).map(set => goal.metric === "load" ? set.weightKg : estimatedOneRepMax(set) ?? 0));
  return { value, percent: Math.max(0, Math.min(100, (value - goal.baseline) / (goal.target - goal.baseline) * 100)), achieved: value >= goal.target };
}
