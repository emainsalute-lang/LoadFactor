import { z } from "zod";
import { emailSchema } from "./account-validation";
import { planningDate } from "./planning";
import { sessionTrainingLoad } from "./analytics";
import { performanceTests } from "./tests-analysis";
import { strengthCatalog, estimatedOneRepMax } from "./strength";
import type { WorkoutSession } from "./types";

export const coachPermissionsSchema = z.object({
  sessions: z.boolean(), wellness: z.boolean(), planning: z.boolean(), assignPlans: z.boolean(), feedback: z.boolean(),
});
export type CoachPermissions = z.infer<typeof coachPermissionsSchema>;
export const noCoachPermissions: CoachPermissions = { sessions: false, wellness: false, planning: false, assignPlans: false, feedback: false };
const id = z.string().min(1).max(100);
export const invitationSchema = z.object({ email: emailSchema, teamId: id });
export const acceptInvitationSchema = z.object({ code: z.string().regex(/^[a-f0-9]{64}$/, "Enter the invitation code supplied by your coach."), permissions: coachPermissionsSchema });
export const assignmentSchema = z.object({ teamId: id, templateId: id, athleteIds: z.array(id).min(1).max(50).refine(ids => new Set(ids).size === ids.length), start: planningDate, weeks: z.number().int().min(1).max(12), weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(days => new Set(days).size === days.length) });
export const commentSchema = z.object({ athleteId: id, sessionId: id, body: z.string().trim().min(1).max(2000), replyTo: id.nullable().default(null) });
export const reportSchema = z.object({ title: z.string().trim().min(1).max(80), from: planningDate, to: planningDate, expiresDays: z.number().int().min(1).max(90) }).refine(input => input.from <= input.to, "Report start must be before the end date.");
export interface CoachConnection { coachId: string; athleteId: string; name: string; sport: string; permissions: CoachPermissions }
export interface TeamTemplate { id: string; name: string; input: import("./validation").SessionInput }
export interface TeamView { id: string; name: string; coachId: string; coachName: string; members: { id: string; name: string; sport: string }[]; templates: TeamTemplate[] }
export interface Feedback { id: string; athleteId: string; coachId: string; sessionId: string; authorId: string; authorName: string; body: string; replyTo: string | null; createdAt: string }
export interface ReportMetadata { id: string; title: string; from: string; to: string; expiresAt: string; revoked: boolean }
export interface CoachingState { connections: CoachConnection[]; teams: TeamView[]; invitations: { id: string; email: string; teamName: string; expiresAt: string; status: string }[]; reports: ReportMetadata[]; assignments: { planId: string; coachName: string; teamName: string }[] }
export interface AthleteCoachView { athlete: { id: string; name: string; sport: string }; permissions: CoachPermissions; sessions?: WorkoutSession[]; wellness?: import("./wellness").WellnessCheckIn[]; planning?: import("./planning").Planning }
export interface CompletionRow { athleteId: string; name: string; allowed: boolean; scheduled?: number; completed?: number; missed?: number; upcoming?: number }
export function buildProgressReport(title: string, athleteName: string, from: string, to: string, allSessions: WorkoutSession[], createdAt: string) {
  const sessions = allSessions.filter(session => session.date >= from && session.date <= to);
  const loads = sessions.map(sessionTrainingLoad).filter((value): value is number => value !== null);
  const strength = strengthCatalog(sessions).flatMap(exercise => {
    const sets = sessions.flatMap(s => s.exercises).filter(s => s.exerciseId === exercise.id);
    if (!sets.length) return [];
    const estimates = sets.map(estimatedOneRepMax).filter((value): value is number => value !== null);
    return [{ name: exercise.name, estimateKg: estimates.length ? Math.max(...estimates) : null, volumeKg: sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0) }];
  });
  const tests = performanceTests(sessions).map((test, index) => ({ name: test.name, variant: test.variant, protocolGroup: index + 1, best: test.best, average: test.average, trials: test.trials.length, unit: test.kind === "sprint" ? "s" : "cm" }));
  const dates = [...new Set(sessions.map(s => s.date))].sort().map(date => {
    const daily = sessions.filter(s => s.date === date), recorded = daily.map(sessionTrainingLoad).filter((value): value is number => value !== null);
    return { date, sessions: daily.length, volumeKg: daily.reduce((sum, s) => sum + s.volumeKg, 0), sessionLoad: recorded.length ? recorded.reduce((sum, value) => sum + value, 0) : null };
  });
  return { title, athleteName, from, to, createdAt, totals: { sessions: sessions.length, volumeKg: sessions.reduce((sum, s) => sum + s.volumeKg, 0), sessionLoad: loads.length ? loads.reduce((sum, value) => sum + value, 0) : null, loadSessions: loads.length }, strength, tests, dates };
}
export type ProgressReport = ReturnType<typeof buildProgressReport>;
