import { z } from "zod";
import { exercises } from "./exercises";
import { muscleGroups } from "./types";
import { dateKey } from "./analytics";
export const customExerciseSchema = z.object({
  id: z.string().regex(/^custom-[a-zA-Z0-9-]+$/),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["strength", "jump", "sprint"]),
});
export const setDetailSchema = z.object({
  setType: z.enum(["working", "warmup", "drop"]).default("working"),
  superset: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,12}$/, "Use a short superset label, such as A.").nullable().default(null),
  dropGroup: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,16}$/, "Use a short drop group label.").nullable().default(null),
  tempo: z.string().trim().toUpperCase().regex(/^(\d{1,2}|X)-(\d{1,2}|X)-(\d{1,2}|X)-(\d{1,2}|X)$/, "Tempo must have four stages, such as 3-1-X-0.").refine(t => t.split("-").every(v => v === "X" || Number(v) <= 30), "Tempo stages must be 0-30 seconds or X.").nullable().default(null),
  pauseSeconds: z.number().finite().min(0).max(60).nullable().default(null),
});
export const strengthSettingsSchema = z.object({
  muscles: z.record(z.string().min(1).max(100), z.array(z.enum(muscleGroups)).max(10).refine(groups => new Set(groups).size === groups.length, "Duplicate muscle groups.")).default({}),
  alternatives: z.record(z.string().min(1).max(100), z.array(z.string().min(1).max(100)).max(10).refine(ids => new Set(ids).size === ids.length, "Duplicate alternatives.")).default({}),
}).refine(s => Object.keys(s.muscles).length <= 100 && Object.keys(s.alternatives).length <= 100, "Too many exercise settings.").refine(s => Object.entries(s.alternatives).every(([id, alternatives]) => !alternatives.includes(id)), "An exercise cannot substitute for itself.");
export type StrengthSettings = z.infer<typeof strengthSettingsSchema>;
export const testDetailSchema = z.object({
  jumpCategory: z.enum(["countermovement", "squat", "depth", "vertical", "broad"]),
  approach: z.enum(["standing", "approach"]), leg: z.enum(["both", "left", "right"]),
  broadJumpCm: z.number().finite().positive().max(1500).nullable(),
  distanceM: z.number().finite().positive().max(10000).nullable(),
  splits: z.array(z.object({ distanceM: z.number().finite().positive().max(10000), seconds: z.number().finite().positive().max(3600) })).max(20),
  protocol: z.string().trim().max(1000),
});
export function sessionSchemaFor(today: () => string = () => dateKey(new Date())) { return z.object({
  durationMinutes: z.number().finite().positive().max(1440).nullable().default(null),
  sessionRpe: z.number().finite().min(0).max(10).nullable().default(null),
  plannedWorkoutId: z.string().min(1).max(100).nullable().default(null),
  title: z.string().trim().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(value + "T12:00:00");
    return !Number.isNaN(parsed.getTime()) && dateKey(parsed) === value && value <= today();
  }, "Choose a valid date that is not in the future."),
  notes: z.string().trim().max(1000).default(""),
  bodyweightKg: z.number().finite().min(1).max(500).nullable().default(null),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(24).refine(t => !t.includes(","), "Tags cannot contain commas.")).max(10).default([]).transform(tags => [...new Set(tags)]),
  customExercises: z.array(customExerciseSchema).max(100).default([]),
  exercises: z.array(z.object({
    ...setDetailSchema.shape,
    videoUrl: z.string().trim().url().max(2048).refine(value => { try { return new URL(value).protocol === "https:"; } catch { return false; } }, "Technique video links must use HTTPS.").nullable().default(null),
    test: testDetailSchema.nullable().default(null),
    exerciseId: z.string(),
    weightKg: z.number().finite().min(0).max(1500),
    reps: z.number().int().min(1).max(1000),
    jumpHeightCm: z.number().finite().positive().max(400).nullable(),
    splitTimeSeconds: z.number().finite().positive().max(3600).nullable(),
    rpe: z.number().int().min(1).max(10),
  })).min(1).max(100),
}).superRefine((input, ctx) => {
  if (new Set(input.customExercises.map(e => e.id)).size !== input.customExercises.length)
    ctx.addIssue({ code: "custom", path: ["customExercises"], message: "Duplicate custom exercise IDs." });
  const catalog = [...exercises, ...input.customExercises];
  const drops = new Map<string, { exerciseId: string; weightKg: number }>();
  const supersets = new Map<string, Set<string>>();
  input.exercises.forEach((set, index) => {
    const exercise = catalog.find(e => e.id === set.exerciseId);
    const issue = (field: string, message: string) => ctx.addIssue({ code: "custom", path: ["exercises", index, field], message });
    if (exercise?.kind !== "strength" && (set.setType !== "working" || set.superset || set.dropGroup || set.tempo || set.pauseSeconds !== null)) issue("setType", "Strength set details apply only to strength exercises.");
    if (set.superset) { const group = supersets.get(set.superset) ?? new Set<string>(); group.add(set.exerciseId); supersets.set(set.superset, group); }
    if (set.setType === "warmup" && set.dropGroup) issue("dropGroup", "Warm-up sets cannot anchor a drop group.");
    if (set.setType === "drop" && !set.dropGroup) issue("dropGroup", "Drop sets require a drop group and a preceding heavier set.");
    if (set.dropGroup) {
      const previous = drops.get(set.dropGroup);
      if (previous && previous.exerciseId !== set.exerciseId) issue("dropGroup", "A drop group must use the same exercise.");
      if (set.setType === "drop" && (!previous || previous.weightKg <= set.weightKg)) issue("weightKg", "A drop set must follow a heavier set in its drop group.");
      if (set.setType !== "warmup") drops.set(set.dropGroup, { exerciseId: set.exerciseId, weightKg: set.weightKg });
    }
    if (!exercise) issue("exerciseId", "Unknown exercise");
    const test = set.test;
    if (test && exercise?.kind === "strength") issue("test", "Test details apply only to jumps and sprints.");
    if (exercise?.kind === "jump") {
      const broad = test ? test.jumpCategory === "broad" : set.exerciseId === "broad-jump";
      if (broad && !test?.broadJumpCm) issue("test", "Broad jump distance is required.");
      if (!broad && set.jumpHeightCm === null) issue("jumpHeightCm", "Jump height is required.");
      if (broad && set.jumpHeightCm !== null) issue("jumpHeightCm", "Broad jumps use distance, not height.");
      if (test && (test.distanceM !== null || test.splits.length || (!broad && test.broadJumpCm !== null))) issue("test", "Use only the measurements for this jump test.");
    }
    if (exercise?.kind === "sprint" && test) {
      if (test.distanceM === null) issue("test", "Sprint distance is required.");
      if (test.broadJumpCm !== null) issue("test", "Sprints cannot contain broad jump measurements.");
      let distance = 0, seconds = 0;
      for (const split of test.splits) {
        if (split.distanceM <= distance || split.seconds <= seconds || split.distanceM > (test.distanceM ?? 0) || split.seconds > (set.splitTimeSeconds ?? 0)) issue("test", "Cumulative splits must increase in distance and time and stay within the sprint total.");
        if (split.distanceM === test.distanceM && split.seconds !== set.splitTimeSeconds) issue("test", "A finish split must match the total time.");
        distance = split.distanceM; seconds = split.seconds;
      }
    }
    if (exercise?.kind === "sprint" && set.exerciseId === "sprint-test" && !test) issue("test", "Specify a distance for this sprint test.");
    if (exercise?.kind === "sprint" && set.splitTimeSeconds === null) issue("splitTimeSeconds", "Split time is required.");
    if (exercise?.kind !== "jump" && set.jumpHeightCm !== null) issue("jumpHeightCm", "Only jump exercises accept a jump height.");
    if (exercise?.kind !== "sprint" && set.splitTimeSeconds !== null) issue("splitTimeSeconds", "Only sprint exercises accept a split time.");
  });
  for (const [label, ids] of supersets) if (ids.size < 2) ctx.addIssue({ code: "custom", path: ["exercises"], message: "Superset " + label + " must contain at least two different exercises." });
}); }
export const sessionInputSchema = sessionSchemaFor();
export type SessionInput = z.infer<typeof sessionInputSchema>;
