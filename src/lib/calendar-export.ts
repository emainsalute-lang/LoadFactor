import type { PlannedWorkout, WorkoutDocument } from "./planning";

function escapeText(value: string) { return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll(/\r?\n/g, "\\n"); }
export function trainingCalendar(plans: PlannedWorkout[], documents: WorkoutDocument[] = []) {
  const entries = [
    ...plans.map(plan => ({ id: plan.id, date: plan.date, title: plan.input.title, description: plan.input.exercises.map(set => `${set.exerciseId}: ${set.reps} reps at ${set.weightKg} kg`).join("\n") })),
    ...documents.map(doc => ({ id: doc.id, date: doc.date, title: doc.title, description: [doc.objective, doc.warmup && "Warm-up: " + doc.warmup, ...doc.rows.map(row => `${row.name}: ${row.sets} sets × ${row.reps}${row.load ? " / " + row.load : ""}${row.rest ? " / rest " + row.rest : ""}${row.instructions ? " / " + row.instructions : ""}`), doc.cooldown && "Cool-down: " + doc.cooldown, doc.notes].filter(Boolean).join("\n") })),
  ];
  const events = entries.sort((a, b) => a.date.localeCompare(b.date)).map(plan => {
    const start = plan.date.replaceAll("-", ""), endDate = new Date(Date.UTC(Number(plan.date.slice(0, 4)), Number(plan.date.slice(5, 7)) - 1, Number(plan.date.slice(8, 10)) + 1)).toISOString().slice(0, 10).replaceAll("-", "");
    return ["BEGIN:VEVENT", `UID:${plan.id}@loadfactor`, `DTSTAMP:${new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}/, "")}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${endDate}`, `SUMMARY:${escapeText(plan.title)}`, `DESCRIPTION:${escapeText(plan.description)}`, "END:VEVENT"].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LoadFactor//Training Calendar//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
}
