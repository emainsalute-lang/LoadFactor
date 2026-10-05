"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, Dumbbell } from "lucide-react";
import { heightFromCm, parseDate, sessionTrainingLoad, weightFromKg } from "@/lib/analytics";
import { sessionCatalog, sessionTotals } from "@/lib/history";
import { performanceTests } from "@/lib/tests-analysis";
import type { HeightUnit, WeightUnit, WorkoutSession } from "@/lib/types";

export default function WorkoutResults({ session, weightUnit, heightUnit }: { session: WorkoutSession; weightUnit: WeightUnit; heightUnit: HeightUnit }) {
  const totals = sessionTotals(session);
  const catalog = sessionCatalog(session);
  const strength = catalog.filter(exercise => exercise.kind === "strength" && session.exercises.some(set => set.exerciseId === exercise.id));
  const tests = performanceTests([session]);
  const load = sessionTrainingLoad(session);
  return <section className="workout-results" aria-labelledby="workout-results-heading">
    <div className="results-heading"><span className="icon-box"><CheckCircle2 size={24}/></span><div><span className="eyebrow">Workout results</span><h2 id="workout-results-heading">{session.title}</h2><p>{parseDate(session.date).toLocaleDateString("en-US", { dateStyle: "long" })} · Results from this workout</p></div></div>
    <dl className="results-metrics">
      <div><dt>Exercises</dt><dd>{new Set(session.exercises.map(set => set.exerciseId)).size}</dd></div>
      <div><dt>Sets / attempts</dt><dd>{totals.sets}</dd></div>
      <div><dt>Total volume</dt><dd>{weightFromKg(totals.volumeKg, weightUnit).toLocaleString(undefined, { maximumFractionDigits: 1 })}<small> {weightUnit}</small></dd><p>Weight × reps</p></div>
      <div><dt>Average set effort</dt><dd>{totals.averageRpe?.toFixed(1) ?? "—"}<small> / 10</small></dd></div>
      {session.durationMinutes != null && <div><dt>Duration</dt><dd>{session.durationMinutes}<small> min</small></dd></div>}
      {load !== null && <div><dt>Session load</dt><dd>{load.toLocaleString(undefined, { maximumFractionDigits: 1 })}<small> AU</small></dd><p>Minutes × overall effort</p></div>}
    </dl>
    <div className="results-chart-grid">
      {strength.map(exercise => {
        const sets = session.exercises.filter(set => set.exerciseId === exercise.id);
        const points = sets.map((set, index) => ({ label: `Set ${index + 1}`, value: weightFromKg(set.weightKg, weightUnit), reps: set.reps, rpe: set.rpe, type: set.setType ?? "working" }));
        return <section className="panel results-chart" key={exercise.id}><h3><Dumbbell size={18}/>{exercise.name}</h3><p>Weight per set · {weightUnit}. Reps and effort are listed below.</p><ResultChart points={points} unit={weightUnit}/><div className="table-scroll"><table><caption className="sr-only">{exercise.name} set results</caption><thead><tr><th>Set</th><th>Type</th><th>Weight ({weightUnit})</th><th>Reps</th><th>Effort / 10</th></tr></thead><tbody>{points.map(point => <tr key={point.label}><td>{point.label}</td><td>{point.type}</td><td>{point.value.toFixed(1)}</td><td>{point.reps}</td><td>{point.rpe}</td></tr>)}</tbody></table></div></section>;
      })}
      {tests.map(test => {
        const sprint = test.kind === "sprint";
        const unit = sprint ? "sec" : heightUnit;
        const convert = (value: number) => sprint ? value : heightFromCm(value, heightUnit);
        const points = test.trials.map((trial, index) => ({ label: `Attempt ${index + 1}`, value: convert(trial.value), rpe: trial.set.rpe, speed: trial.speedMps }));
        return <section className="panel results-chart" key={test.key}><h3>{test.name}</h3><p>{test.variant} · {sprint ? "Lower time is faster" : "Higher measurement is better"}</p><div className="results-test-stats"><span>Best <strong>{test.best === null ? "—" : convert(test.best).toFixed(sprint ? 3 : 1)} {unit}</strong></span><span>Average <strong>{test.average === null ? "—" : convert(test.average).toFixed(sprint ? 3 : 1)} {unit}</strong></span></div><ResultChart points={points} unit={unit}/><div className="table-scroll"><table><caption className="sr-only">{test.name} measured attempts</caption><thead><tr><th>Attempt</th><th>{sprint ? "Time (sec)" : `Measurement (${unit})`}</th><th>Effort / 10</th>{sprint && <th>Speed (m/s)</th>}</tr></thead><tbody>{points.map(point => <tr key={point.label}><td>{point.label}</td><td>{point.value.toFixed(sprint ? 3 : 1)}</td><td>{point.rpe}</td>{sprint && <td>{point.speed?.toFixed(2) ?? "Not recorded"}</td>}</tr>)}</tbody></table></div><p className="results-protocol">{test.protocol}</p></section>;
      })}
    </div>
    <p className="account-description">These charts show this workout’s sets and attempts. Weekly totals and longer-term progress are available on Home, Strength, and Jump & sprint.</p>
  </section>;
}

function ResultChart({ points, unit }: { points: { label: string; value: number }[]; unit: string }) {
  return <div className="results-chart-canvas" role="img" aria-label={`Workout chart with ${points.length} measurements in ${unit}; values are listed in the table below`}><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={points} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}><CartesianGrid stroke="#e6e5dc" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="label" tick={{ fill: "#606875", fontSize: 12 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: "#606875", fontSize: 12 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #deded5", borderRadius: 8, color: "#252a32" }} cursor={{ fill: "#c99b0b12" }} formatter={value => [Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 }) + " " + unit, "Result"]}/><Bar dataKey="value" fill="#c99b0b" radius={[6, 6, 0, 0]} maxBarSize={52}/></BarChart></ResponsiveContainer></div>;
}
