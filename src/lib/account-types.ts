import type { User, SessionSubmission, Exercise } from "./types";
import type { SavedHistoryFilter } from "./history";
import type { StrengthSettings } from "./validation";
import type { WorkoutTemplate } from "./workspace";
import type { Planning } from "./planning";
import type { WellnessCheckIn } from "./wellness";
export interface AccountUser extends User { email: string; timezone: string; createdAt: string; role: "athlete" | "coach" }
export interface AccountWorkspace { records: SessionSubmission[]; custom: Exercise[]; templates: WorkoutTemplate[]; savedFilters: SavedHistoryFilter[]; strengthSettings: StrengthSettings; planning: Planning; wellness: WellnessCheckIn[] }
export function athleteToday(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
