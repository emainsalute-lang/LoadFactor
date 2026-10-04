import { sessionSchemaFor, type SessionInput } from "./validation";
import type { WorkoutSession } from "./types";

export interface CsvPreviewRow { line: number; title: string; session?: SessionInput; error?: string }

function escapeCsv(value: string) {
  const safe = /^[=+\-@]/.test(value) ? "'" + value : value;
  return /[",\r\n]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe;
}

export function exportSessionsCsv(sessions: WorkoutSession[]) {
  const rows = [["session_id", "date", "title", "session_json"]];
  for (const session of sessions) {
    const input: SessionInput = {
      title: session.title, date: session.date, notes: session.notes, tags: session.tags ?? [],
      bodyweightKg: session.bodyweightKg ?? null, durationMinutes: session.durationMinutes ?? null, sessionRpe: session.sessionRpe ?? null,
      plannedWorkoutId: null, customExercises: session.customExercises ?? [],
      exercises: session.exercises.map(set => ({
        exerciseId: set.exerciseId, weightKg: set.weightKg, reps: set.reps, jumpHeightCm: set.jumpHeightCm,
        splitTimeSeconds: set.splitTimeSeconds, rpe: set.rpe, setType: set.setType ?? "working",
        superset: set.superset ?? null, dropGroup: set.dropGroup ?? null, tempo: set.tempo ?? null,
        pauseSeconds: set.pauseSeconds ?? null, videoUrl: set.videoUrl ?? null, test: set.test ?? null,
      })),
    };
    rows.push([session.id, session.date, session.title, JSON.stringify(input)]);
  }
  return rows.map(row => row.map(escapeCsv).join(",")).join("\r\n") + "\r\n";
}

function parseRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  if (field !== "" || row.length) { row.push(field); if (row.some(value => value !== "")) rows.push(row); }
  return rows;
}

export function previewSessionsCsv(text: string, today: string): CsvPreviewRow[] {
  if (text.length > 10_000_000) throw new Error("CSV file is larger than 10 MB.");
  const rows = parseRows(text);
  if (!rows.length) throw new Error("CSV file is empty.");
  const headers = rows[0].map(value => value.trim().toLowerCase());
  const jsonColumn = headers.indexOf("session_json");
  if (jsonColumn < 0) throw new Error("CSV needs a session_json column. Export a LoadFactor session CSV to get the supported format.");
  return rows.slice(1).map((row, index) => {
    const raw = row[jsonColumn] ?? "";
    try {
      const parsed = sessionSchemaFor(() => today).safeParse(JSON.parse(raw));
      if (!parsed.success) return { line: index + 2, title: row[headers.indexOf("title")] ?? "Untitled", error: parsed.error.issues[0]?.message ?? "Session is invalid." };
      return { line: index + 2, title: parsed.data.title, session: parsed.data };
    } catch (error) {
      return { line: index + 2, title: row[headers.indexOf("title")] ?? "Untitled", error: error instanceof Error ? error.message : "Session JSON is invalid." };
    }
  });
}
