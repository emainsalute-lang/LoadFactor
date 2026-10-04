"use client";
import { useEffect, useState, type FormEvent } from "react";
import { weekStart, weightFromKg, weightToKg } from "@/lib/analytics";
import { api } from "@/lib/client-api";
import { historyCatalog } from "@/lib/history";
import { blockPlans, comparePlan, completedPlan, goalProgress, planningSchema, shiftDate, type Planning, type PlannedWorkout } from "@/lib/planning";
import { templatesSchema, type WorkoutTemplate } from "@/lib/workspace";
import type { WeightUnit, WorkoutSession } from "@/lib/types";
import { trainingCalendar } from "@/lib/calendar-export";

export default function TrainingPlanner({ planning, onPlanning, sessions, today, accountId, timezone, templates: initialTemplates, weightUnit, onStart, onLink }: {
  planning: Planning; onPlanning: (value: Planning) => void; sessions: WorkoutSession[]; today: string;
  accountId?: string; timezone?: string; templates: WorkoutTemplate[]; weightUnit: WeightUnit;
  onStart: (plan: PlannedWorkout) => void; onLink: (session: WorkoutSession, planId: string | null) => Promise<void>;
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [templateId, setTemplateId] = useState("");
  const [date, setDate] = useState(today);
  const [week, setWeek] = useState(weekStart(today));
  const [blockName, setBlockName] = useState("Training block");
  const [weeks, setWeeks] = useState(4);
  const [days, setDays] = useState([1, 3, 5]);
  const [mode, setMode] = useState<"none" | "load" | "reps">("none");
  const [increment, setIncrement] = useState(2.5);
  const [deloadEvery, setDeloadEvery] = useState(4);
  const [deloadPercent, setDeloadPercent] = useState(30);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(!!accountId);
  const [editing, setEditing] = useState<PlannedWorkout | null>(null);
  const [goalName, setGoalName] = useState("");
  const [goalMetric, setGoalMetric] = useState<Planning["goals"][number]["metric"]>("sessions");
  const [goalExercise, setGoalExercise] = useState("");
  const [goalStart, setGoalStart] = useState(today);
  const [goalEnd, setGoalEnd] = useState(shiftDate(today, 27));
  const [baseline, setBaseline] = useState("0");
  const [target, setTarget] = useState("12");
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("08:00");
  const [minReps, setMinReps] = useState(1);
  const catalog = [...historyCatalog(sessions), ...templates.flatMap(t => t.input.customExercises)].filter((e, i, all) => all.findIndex(x => x.id === e.id) === i);
  const template = templates.find(t => t.id === templateId) ?? templates[0];
  useEffect(() => {
    let stopped = false;
    function load() {
      if (accountId) {
        void api<{ templates: WorkoutTemplate[] }>("/api/account/workspace").then(value => { if (!stopped) setTemplates(templatesSchema.parse(value.templates)); }).catch(() => {});
      } else {
        try { const raw = localStorage.getItem("loadfactor-templates-v1"); if (raw) setTemplates(templatesSchema.parse(JSON.parse(raw))); } catch { setError("Saved templates could not be read."); }
      }
    }
    const frame = requestAnimationFrame(() => {
      if (!accountId) {
        try { const raw = localStorage.getItem("loadfactor-planning-v1"); if (raw) onPlanning(planningSchema.parse(JSON.parse(raw))); } catch { setError("Saved planning data could not be read. Export available data before changing plans."); }
      }
      try {
        const key = `loadfactor-reminders:${accountId ?? "guest"}`;
        setRemindersEnabled(localStorage.getItem(key) === "enabled");
        setReminderTime(localStorage.getItem(key + ":time") ?? "08:00");
      } catch { setError("Reminder preferences could not be read from this browser."); }
      setReady(true); load();
    });
    window.addEventListener("focus", load); window.addEventListener("loadfactor-assets", load);
    return () => { stopped = true; cancelAnimationFrame(frame); window.removeEventListener("focus", load); window.removeEventListener("loadfactor-assets", load); };
  }, [accountId, onPlanning]);
  useEffect(() => {
    if (!remindersEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
    function checkReminder() {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
      const dateKey = `${part("year")}-${part("month")}-${part("day")}`;
      const clock = `${part("hour")}:${part("minute")}`;
      if (clock !== reminderTime) return;
      try {
        for (const plan of planning.plans.filter(item => item.date === dateKey)) {
          const key = `loadfactor-reminded:${accountId ?? "guest"}:${plan.id}:${dateKey}`;
          if (localStorage.getItem(key)) continue;
          new Notification("Training reminder", { body: `${plan.input.title} is scheduled for today.` });
          localStorage.setItem(key, "sent");
        }
      } catch (error) {
        console.error("Training reminder failed:", error);
        window.setTimeout(() => setError("A training reminder could not be delivered or saved."), 0);
      }
    }
    checkReminder();
    const timer = window.setInterval(checkReminder, 30_000);
    return () => window.clearInterval(timer);
  }, [accountId, planning.plans, reminderTime, remindersEnabled, timezone]);
  async function enableReminders() {
    if (!("Notification" in window)) { setError("This browser does not support notifications."); return; }
    let permission: NotificationPermission;
    try { permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission; }
    catch { setError("The browser did not allow a notification permission request."); return; }
    if (permission !== "granted") { setError("Allow notifications in your browser to enable training reminders."); return; }
    try {
      localStorage.setItem(`loadfactor-reminders:${accountId ?? "guest"}`, "enabled");
      localStorage.setItem(`loadfactor-reminders:${accountId ?? "guest"}:time`, reminderTime);
      setRemindersEnabled(true); setError(""); setNotice("Reminders enabled while LoadFactor is open in this browser.");
    } catch { setError("Reminder preferences could not be saved."); }
  }
  function updateReminderTime(value: string) {
    setReminderTime(value);
    try { localStorage.setItem(`loadfactor-reminders:${accountId ?? "guest"}:time`, value); }
    catch { setError("Reminder time could not be saved."); }
  }
  function exportCalendar() {
    const text = trainingCalendar(planning.plans);
    const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "loadfactor-training.ics"; link.click(); URL.revokeObjectURL(url);
  }
  async function save(next: Planning) {
    if (busy) return false;
    setError(""); setNotice("");
    const parsed = planningSchema.safeParse(next);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your planning details."); return false; }
    setBusy(true);
    try {
      const result = accountId ? (await api<{ planning: Planning }>("/api/account/planning", "PUT", parsed.data)).planning : parsed.data;
      if (!accountId) localStorage.setItem("loadfactor-planning-v1", JSON.stringify(result));
      onPlanning(result); setNotice(accountId ? "Plan saved to your account." : "Plan saved to this browser."); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Planning save failed."); return false; }
    finally { setBusy(false); }
  }
  async function schedule(event: FormEvent, block: boolean) {
    event.preventDefault();
    if (!template) { setError("Save a workout template in the logger first."); return; }
    if (block && !days.length) { setError("Select at least one training day."); return; }
    const value: Planning["blocks"][number] = { id: crypto.randomUUID(), name: blockName, start: date, weeks: block ? weeks : 1,
      rule: { mode: block ? mode : "none", increment: mode === "load" ? weightToKg(increment, weightUnit) : increment, deloadEvery: block ? deloadEvery : 0, deloadPercent } };
    try {
      const plans = block ? blockPlans(template.input, template.name, value, days) : [{ id: crypto.randomUUID(), date, originalDate: date, blockId: null, deload: false, templateName: template.name, input: { ...template.input, plannedWorkoutId: null, date } }];
      await save({ ...planning, blocks: block ? [...planning.blocks, value] : planning.blocks, plans: [...planning.plans, ...plans] });
    } catch { setError("Check the start date and block length."); }
  }
  async function addGoal(event: FormEvent) {
    event.preventDefault(); const kilograms = goalMetric !== "sessions";
    if (await save({ ...planning, goals: [...planning.goals, { id: crypto.randomUUID(), name: goalName, metric: goalMetric, exerciseId: goalExercise, start: goalStart, end: goalEnd, baseline: kilograms ? weightToKg(Number(baseline), weightUnit) : Number(baseline), target: kilograms ? weightToKg(Number(target), weightUnit) : Number(target), minReps }] })) setGoalName("");
  }
  function updateSet(index: number, values: Partial<PlannedWorkout["input"]["exercises"][number]>) {
    setEditing(current => current ? { ...current, input: { ...current.input, exercises: current.input.exercises.map((set, i) => i === index ? { ...set, ...values } : set) } } : null);
  }
  const weekPlans = planning.plans.filter(p => p.date >= week && p.date <= shiftDate(week, 6)).sort((a, b) => a.date.localeCompare(b.date));
  const missed = planning.plans.filter(p => p.date < today && !completedPlan(p, sessions)).sort((a, b) => a.date.localeCompare(b.date));
  function planCard(plan: PlannedWorkout) {
    const completed = completedPlan(plan, sessions);
    return <article className="set-row" key={plan.id}><h3>{plan.date} / {plan.input.title}{plan.deload ? " / Deload" : ""}</h3>
      <p className="account-description">{plan.templateName}{plan.blockId ? " / " + planning.blocks.find(b => b.id === plan.blockId)?.name : ""} / {completed ? "Completed " + completed.date : plan.date < today ? "Missed" : "Scheduled"}{plan.originalDate !== plan.date ? " / originally " + plan.originalDate : ""}</p>
      <div className="phase-controls"><button className="secondary-button" type="button" disabled={busy} onClick={() => setEditing(structuredClone(plan))}>Edit targets / reschedule</button>
        {!completed && <><button className="primary-button" type="button" disabled={busy || plan.date > today} onClick={() => onStart(plan)}>Start workout</button><button className="text-button" type="button" disabled={busy} onClick={() => void save({ ...planning, plans: planning.plans.filter(p => p.id !== plan.id) })}>Remove schedule</button></>}
        {completed && <button className="text-button" type="button" disabled={busy} onClick={() => void link(completed, null)}>Unlink completion</button>}
      </div>
      {!completed && <label className="field-label">Link a completed workout<select value="" disabled={busy} onChange={e => { const session = sessions.find(s => s.id === e.target.value); if (session) void link(session, plan.id); }}><option value="">Choose an unlinked session</option>{sessions.filter(s => !s.plannedWorkoutId).map(s => <option key={s.id} value={s.id}>{s.date} / {s.title}</option>)}</select></label>}
      {completed && <div className="table-scroll"><table><caption>Planned versus completed / {completed.title}</caption><thead><tr><th>Exercise</th><th>Sets planned / done</th><th>Reps planned / done</th><th>Volume planned / done ({weightUnit})</th><th>Per-set targets: reps x load @ RPE</th><th>Per-set completed</th></tr></thead><tbody>{comparePlan(plan, completed).map(row => <tr key={row.exerciseId}><td>{catalog.find(e => e.id === row.exerciseId)?.name ?? row.exerciseId}</td><td>{row.planned.sets} / {row.completed.sets}</td><td>{row.planned.reps} / {row.completed.reps}</td><td>{weightFromKg(row.planned.volumeKg, weightUnit).toFixed(1)} / {weightFromKg(row.completed.volumeKg, weightUnit).toFixed(1)}</td><td>{row.targets.map(s => s.reps + " x " + weightFromKg(s.weightKg, weightUnit).toFixed(1) + " @ " + s.rpe).join("; ")}</td><td>{row.actual.map(s => s.reps + " x " + weightFromKg(s.weightKg, weightUnit).toFixed(1) + " @ " + s.rpe).join("; ")}</td></tr>)}</tbody></table></div>}
    </article>;
  }
  async function link(session: WorkoutSession, planId: string | null) {
    setBusy(true); setError("");
    try { await onLink(session, planId); } catch (e) { setError(e instanceof Error ? e.message : "Could not link the workout."); } finally { setBusy(false); }
  }
  return <section id="planning" className="panel scroll-mt-6"><div className="section-title"><div><span className="eyebrow">PLAN YOUR TRAINING</span><h2>Schedule and goals</h2></div></div>
    {error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="success-message" role="status">{notice}</p>}
    <div className="phase-controls"><button type="button" className="secondary-button" onClick={exportCalendar}>Export scheduled training (.ics)</button><label className="field-label">Reminder time<input type="time" value={reminderTime} onChange={event => updateReminderTime(event.target.value)}/></label><button type="button" className="secondary-button" onClick={() => { if (remindersEnabled) { try { localStorage.removeItem(`loadfactor-reminders:${accountId ?? "guest"}`); setRemindersEnabled(false); } catch { setError("Reminder preference could not be removed."); } } else void enableReminders(); }}>{remindersEnabled ? "Disable reminders" : "Enable browser reminders"}</button></div>
    <p className="account-description">Calendar exports include scheduled workouts. Browser reminders require notification permission and LoadFactor to remain open.</p>
    <fieldset disabled={busy || !ready}>
      <form onSubmit={e => void schedule(e, false)}><div className="history-filters"><label className="field-label">Workout template<select value={template?.id ?? ""} onChange={e => setTemplateId(e.target.value)}><option value="" disabled>No saved template</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="field-label">Date / block start<input type="date" required value={date} onChange={e => setDate(e.target.value)}/></label></div><button className="secondary-button" disabled={!template} type="submit">Schedule this date</button></form>
      <p className="account-description">Save templates in the logger. Each schedule keeps a copy of its targets; later template changes do not rewrite it.</p>
      <details><summary>Create multiweek block and progression</summary><form onSubmit={e => void schedule(e, true)}><div className="history-filters">
        <label className="field-label">Block name<input required maxLength={80} value={blockName} onChange={e => setBlockName(e.target.value)}/></label><label className="field-label">Weeks<input type="number" min="1" max="52" required value={weeks} onChange={e => setWeeks(Number(e.target.value))}/></label>
        <label className="field-label">Progression<select value={mode} onChange={e => { setMode(e.target.value as typeof mode); setIncrement(e.target.value === "reps" ? 1 : 2.5); }}><option value="none">Keep targets</option><option value="load">Increase load each training week</option><option value="reps">Increase reps each training week</option></select></label>
        <label className="field-label">Weekly increase ({mode === "load" ? weightUnit : "reps"})<input type="number" min="0" max="100" step={mode === "reps" ? "1" : "any"} required value={increment} onChange={e => setIncrement(Number(e.target.value))}/></label>
        <label className="field-label">Deload every N weeks (0 disables)<input type="number" min="0" max="52" value={deloadEvery} required onChange={e => setDeloadEvery(Number(e.target.value))}/></label><label className="field-label">Deload load reduction (%)<input type="number" min="0" max="90" step="any" required value={deloadPercent} onChange={e => setDeloadPercent(Number(e.target.value))}/></label>
      </div><div className="phase-controls">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => <label key={day}><input type="checkbox" checked={days.includes(i)} onChange={e => setDays(current => e.target.checked ? [...current, i] : current.filter(d => d !== i))}/> {day}</label>)}</div><p className="account-description">Uses the selected template and start date. Progression applies by week, pauses during deloads, and adjusts strength sets only. Deloads reduce strength load. Review generated targets before training.</p><button className="primary-button" disabled={!template}>Create block</button></form></details>
      <h3>Weekly schedule</h3><div className="phase-controls"><button type="button" className="text-button" onClick={() => setWeek(shiftDate(week, -7))}>Previous week</button><label className="field-label">Week containing<input type="date" required value={week} onChange={e => { if (e.target.value) setWeek(weekStart(e.target.value)); }}/></label><button type="button" className="text-button" onClick={() => setWeek(shiftDate(week, 7))}>Next week</button></div>
      <div className="history-filters">{Array.from({ length: 7 }, (_, i) => { const date = shiftDate(week, i); return <div className="set-row" key={date}><strong>{date}</strong><p>{planning.plans.filter(p => p.date === date).length} workouts</p></div>; })}</div>
      {weekPlans.map(planCard)}{!weekPlans.length && <p>No workouts scheduled this week.</p>}
      <details><summary>Missed workouts ({missed.length})</summary>{missed.map(planCard)}</details>
      <details><summary>Training blocks ({planning.blocks.length})</summary>{planning.blocks.map(block => <p key={block.id}>{block.name} / {block.start} / {block.weeks} weeks / {planning.plans.filter(p => p.blockId === block.id).length} scheduled workouts</p>)}</details>
      {editing && <form onSubmit={async e => { e.preventDefault(); if (await save({ ...planning, plans: planning.plans.map(p => p.id === editing.id ? editing : p) })) setEditing(null); }}><h3>Edit workout targets</h3><div className="history-filters"><label className="field-label">Scheduled date<input type="date" required value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value, input: { ...editing.input, date: e.target.value } })}/></label><label className="field-label">Workout title<input required maxLength={80} value={editing.input.title} onChange={e => setEditing({ ...editing, input: { ...editing.input, title: e.target.value } })}/></label><label><input type="checkbox" checked={editing.deload} onChange={e => setEditing({ ...editing, deload: e.target.checked })}/> Deload workout</label></div>
        <p className="account-description">Marking a workout as a deload does not change targets automatically. Adjust loads and sets below. Rescheduling keeps the original date and block.</p>
        {editing.input.exercises.map((set, i) => <div className="set-row" key={i}><strong>{catalog.find(e => e.id === set.exerciseId)?.name ?? set.exerciseId} / target set {i + 1}</strong><div className="history-filters"><label className="field-label">Reps<input type="number" required min="1" max="1000" value={set.reps} onChange={e => updateSet(i, { reps: Number(e.target.value) })}/></label><label className="field-label">Load ({weightUnit})<input type="number" min="0" step="any" required value={weightFromKg(set.weightKg, weightUnit)} onChange={e => updateSet(i, { weightKg: weightToKg(Number(e.target.value), weightUnit) })}/></label><label className="field-label">Target RPE<input type="number" required min="1" max="10" value={set.rpe} onChange={e => updateSet(i, { rpe: Number(e.target.value) })}/></label></div><button type="button" className="text-button" onClick={() => setEditing({ ...editing, input: { ...editing.input, exercises: [...editing.input.exercises.slice(0, i + 1), structuredClone(set), ...editing.input.exercises.slice(i + 1)] } })}>Add target set</button><button type="button" className="text-button" disabled={editing.input.exercises.length === 1} onClick={() => setEditing({ ...editing, input: { ...editing.input, exercises: editing.input.exercises.filter((_, index) => index !== i) } })}>Remove set</button></div>)}
        <button className="primary-button">Save targets / reschedule</button><button type="button" className="text-button" onClick={() => setEditing(null)}>Cancel</button>
      </form>}
      <h3>Training goals</h3><form onSubmit={e => void addGoal(e)}><div className="history-filters"><label className="field-label">Goal name<input required maxLength={80} value={goalName} onChange={e => setGoalName(e.target.value)}/></label><label className="field-label">Metric<select value={goalMetric} onChange={e => setGoalMetric(e.target.value as typeof goalMetric)}><option value="sessions">Completed workouts</option><option value="volume">Accumulated volume</option><option value="load">Best working load</option><option value="e1rm">Estimated 1RM</option></select></label><label className="field-label">Exercise<select value={goalExercise} onChange={e => setGoalExercise(e.target.value)}><option value="">All exercises (workouts / volume)</option>{catalog.filter(e => e.kind === "strength").map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label className="field-label">Start<input type="date" required value={goalStart} onChange={e => setGoalStart(e.target.value)}/></label><label className="field-label">Deadline<input type="date" required value={goalEnd} onChange={e => setGoalEnd(e.target.value)}/></label><label className="field-label">Baseline ({goalMetric === "sessions" ? "workouts" : weightUnit})<input type="number" min="0" step="any" required value={baseline} onChange={e => setBaseline(e.target.value)}/></label><label className="field-label">Target ({goalMetric === "sessions" ? "workouts" : weightUnit})<input type="number" min="0.01" step="any" required value={target} onChange={e => setTarget(e.target.value)}/></label>{["load", "e1rm"].includes(goalMetric) && <label className="field-label">Minimum reps for qualifying sets<input type="number" required min="1" max="1000" value={minReps} onChange={e => setMinReps(Number(e.target.value))}/></label>}</div><button className="secondary-button">Create goal</button></form>
      <p className="account-description">Progress uses active completed workouts within the goal dates. Strength goals exclude warm-ups and drops; estimated 1RM uses working sets of 1-10 reps. Volume includes all logged sets.</p>
      {planning.goals.map(goal => { const progress = goalProgress(goal, sessions), convert = (v: number) => goal.metric === "sessions" ? v : weightFromKg(v, weightUnit); return <div className="set-row" key={goal.id}><h3>{goal.name}</h3><p>{goal.start} to {goal.end} / {goal.metric} / {convert(progress.value).toFixed(1)} of {convert(goal.target).toFixed(1)} {goal.metric === "sessions" ? "workouts" : weightUnit} / {progress.achieved ? "Achieved" : goal.end < today ? "Deadline passed" : "In progress"}</p><progress aria-label={goal.name + " progress"} value={progress.percent} max={100}/><span> {progress.percent.toFixed(0)}%</span><button type="button" className="text-button" onClick={() => void save({ ...planning, goals: planning.goals.filter(g => g.id !== goal.id) })}>Remove goal</button></div>; })}
    </fieldset>
  </section>;
}
