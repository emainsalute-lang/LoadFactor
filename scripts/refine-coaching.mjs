import { readFileSync, writeFileSync } from "node:fs";
const edits = [
  ["src/components/coaching-panel.tsx", "Athlete's account email", "Athlete account email"],
  ["src/components/coaching-panel.tsx", "athlete's schedule", "athlete schedule"],
  ["src/components/coaching-panel.tsx", "this coach's assignments", "assignments made by this coach"],
  ["src/components/coaching-panel.tsx", "dates' training totals", "dates and their training totals"],
  ["src/app/reports/[token]/page.tsx", "the app's Epley-style estimate", "an Epley-style estimate"],
];
for (const [path, before, after] of edits) {
  const value = readFileSync(path, "utf8"); if (!value.includes(before)) throw new Error("Missing edit anchor: " + path);
  writeFileSync(path, value.replace(before, after));
}
