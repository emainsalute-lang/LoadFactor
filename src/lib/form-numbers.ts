import type { ZodIssue } from "zod";

export function parseSprintSplits(value: string) {
  if (!value.trim()) return [];
  return value.split(",").map((part, index) => {
    const pieces = part.trim().split(":");
    const distanceM = Number(pieces[0]);
    const seconds = Number(pieces[1]);
    if (pieces.length !== 2 || pieces.some(piece => !piece.trim()) || !Number.isFinite(distanceM) || !Number.isFinite(seconds) || distanceM <= 0 || seconds <= 0) {
      throw new Error(`Sprint split ${index + 1}: enter positive distance:seconds, for example 10:1.8, 20:3.2.`);
    }
    return { distanceM, seconds };
  });
}

export function formIssueMessage(issue?: ZodIssue) {
  if (!issue) return "Check your form details.";
  const labels: Record<string, string> = {
    weightKg: "Weight", reps: "Reps", jumpHeightCm: "Jump height", splitTimeSeconds: "Sprint time",
    bodyweightKg: "Bodyweight", durationMinutes: "Duration", sessionRpe: "Overall effort",
    rpe: "Set effort", broadJumpCm: "Broad jump distance", distanceM: "Sprint distance",
    seconds: "Split time", pauseSeconds: "Pause duration", sleepHours: "Sleep duration",
  };
  const field = String(issue.path.at(-1) ?? "");
  const label = labels[field] ?? field;
  const setIndex = issue.path[0] === "exercises" && typeof issue.path[1] === "number" ? `Set ${issue.path[1] + 1} · ` : "";
  const message = issue.message.includes("received NaN") || issue.message.includes("received number") && issue.code === "invalid_type"
    ? "Enter a valid number. Use a decimal point, for example 12.5."
    : issue.message;
  return `${setIndex}${label ? label + ": " : ""}${message}`;
}
