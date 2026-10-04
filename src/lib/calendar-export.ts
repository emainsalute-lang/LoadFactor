import type { PlannedWorkout } from "./planning";

function escapeText(value: string) { return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll(/\r?\n/g, "\\n"); }
export function trainingCalendar(plans: PlannedWorkout[]) {
  const events = [...plans].sort((a, b) => a.date.localeCompare(b.date)).map(plan => {
    const start = plan.date.replaceAll("-", ""), endDate = new Date(Date.UTC(Number(plan.date.slice(0, 4)), Number(plan.date.slice(5, 7)) - 1, Number(plan.date.slice(8, 10)) + 1)).toISOString().slice(0, 10).replaceAll("-", "");
    const description = plan.input.exercises.map(set => `${set.exerciseId}: ${set.reps} reps at ${set.weightKg} kg`).join("\n");
    return ["BEGIN:VEVENT", `UID:${plan.id}@loadfactor`, `DTSTAMP:${new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}/, "")}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${endDate}`, `SUMMARY:${escapeText(plan.input.title)}`, `DESCRIPTION:${escapeText(description)}`, "END:VEVENT"].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LoadFactor//Training Calendar//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
}
