"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dumbbell, Plus, Trash2, Check, LoaderCircle, ArrowRight } from "lucide-react";
import { z } from "zod";
import { catalogSchema, templatesSchema, moveSet, moveExercise, type LoggerRequest, type WorkoutTemplate } from "@/lib/workspace";
import { exercises } from "@/lib/exercises";
import { heightToCm, weightToKg, weightFromKg, heightFromCm, sessionTrainingLoad } from "@/lib/analytics";
import { api } from "@/lib/client-api";
import { createSession } from "@/lib/sessions";
import { enqueueOfflineSession } from "@/lib/offline-queue";
import { testDetailSchema, sessionSchemaFor, type StrengthSettings } from "@/lib/validation";
import type { Exercise, ExerciseKind, HeightUnit, SetType, SessionSubmission, WeightUnit, WorkoutSession } from "@/lib/types";
import { jumpCategory } from "@/lib/tests-analysis";
type SetDraft = { id: string; exerciseId: string; weight: string; reps: string; height: string; time: string; videoUrl: string; rpe: number; setType: SetType; superset: string; dropGroup: string; tempo: string; pause: string; test: ExerciseLogTest; broad: string; distance: string; splitsText: string; protocol: string; category: string; approach: string; leg: string };
type ExerciseLogTest = import("@/lib/types").ExerciseLog["test"];
const draftSchema = z.object({
  duration: z.string().default(""), sessionRpe: z.string().default(""),
  title: z.string().max(80), date: z.string(), notes: z.string().max(1000), tags: z.string().max(300).default(""), bodyweight: z.string().default(""), editId: z.string().optional(), plannedWorkoutId: z.string().nullable().default(null),
  units: z.object({ weight: z.enum(["kg", "lbs"]), height: z.enum(["cm", "in"]) }),
  sets: z.array(z.object({ test: testDetailSchema.nullable().default(null), broad: z.string().default(""), distance: z.string().default(""), splitsText: z.string().max(2000).default(""), protocol: z.string().max(1000).default(""), category: z.string().default(""), approach: z.string().default("standing"), leg: z.string().default("both"), setType: z.enum(["working", "warmup", "drop"]).default("working"), superset: z.string().max(12).default(""), dropGroup: z.string().max(16).default(""), tempo: z.string().max(20).default(""), pause: z.string().default(""), videoUrl: z.string().max(2048).default(""), id: z.string(), exerciseId: z.string(), weight: z.string(), reps: z.string(), height: z.string(), time: z.string(), rpe: z.number().int().min(1).max(10) })).max(100),
});
function freshSet(exerciseId = "trap-bar-deadlift"): SetDraft {
  return { id: crypto.randomUUID(), exerciseId, weight: "", reps: "5", height: "", time: "", videoUrl: "", rpe: 7, setType: "working", superset: "", dropGroup: "", tempo: "", pause: "", test: null, broad: "", distance: exerciseId === "10m-fly" ? "10" : "", splitsText: "", protocol: "", category: jumpCategory(exerciseId), approach: "standing", leg: "both" };
}
export default function SessionLogger({ weightUnit, heightUnit, onSave, sessions, request, onRequestHandled, accountId, initialAssets, today, strengthSettings, defaultBodyweightKg }: {
  weightUnit: WeightUnit; heightUnit: HeightUnit; onSave: (result: SessionSubmission, editId?: string) => void;
  strengthSettings: StrengthSettings; defaultBodyweightKg: number | null;
  accountId?: string; initialAssets?: { custom: Exercise[]; templates: WorkoutTemplate[] }; today: string;
  sessions: WorkoutSession[]; request: LoggerRequest | null; onRequestHandled: () => void;
}) {
  const [sets, setSets] = useState<SetDraft[]>([]);
  const [bodyweight, setBodyweight] = useState("");
  const [duration, setDuration] = useState("");
  const [sessionRpe, setSessionRpe] = useState("");
  const [title, setTitle] = useState("Afternoon training");
  const [date, setDate] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState({ weight: weightUnit, height: heightUnit });
  const [custom, setCustom] = useState<Exercise[]>(initialAssets?.custom ?? []);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>(initialAssets?.templates ?? []);
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");
  const [customKind, setCustomKind] = useState<ExerciseKind>("strength");
  const [templateName, setTemplateName] = useState("");
  const [editId, setEditId] = useState<string | undefined>();
  const [plannedWorkoutId, setPlannedWorkoutId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [storageNotice, setStorageNotice] = useState("");
  const [restDuration, setRestDuration] = useState(90);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [timerNotice, setTimerNotice] = useState("");
  const catalog = [...exercises, ...custom, ...sessions.flatMap(s => s.customExercises ?? [])].filter((e, i, all) => all.findIndex(x => x.id === e.id) === i);
  const busy = useRef(false);
  const assetQueue = useRef(Promise.resolve());
  const storageSuffix = accountId ? ":" + accountId : "";
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const rawCatalog = accountId ? null : localStorage.getItem("loadfactor-custom-exercises-v1");
        if (rawCatalog) setCustom(catalogSchema.parse(JSON.parse(rawCatalog)));
        const rawTemplates = accountId ? null : localStorage.getItem("loadfactor-templates-v1");
        if (rawTemplates) setTemplates(templatesSchema.parse(JSON.parse(rawTemplates)));
        const rawDraft = localStorage.getItem("loadfactor-draft-v1" + storageSuffix);
        if (rawDraft) {
          const draft = draftSchema.parse(JSON.parse(rawDraft));
          setDuration(draft.duration); setSessionRpe(draft.sessionRpe); setPlannedWorkoutId(draft.plannedWorkoutId); setBodyweight(draft.bodyweight); setTitle(draft.title); setDate(draft.date); setNotes(draft.notes); setTags(draft.tags); setSets(draft.sets); setUnits(draft.units); setEditId(draft.editId); setOpen(true);
          setStorageNotice("Your unfinished session was restored.");
        }
      } catch { setStorageNotice("Some saved logger data could not be read. Export any available sessions before leaving."); }
      setLoaded(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [accountId, storageSuffix]);
  useEffect(() => {
    if (!loaded) return;
    try {
      if (sets.length) localStorage.setItem("loadfactor-draft-v1" + storageSuffix, JSON.stringify({ duration, sessionRpe, title, date, notes, tags, bodyweight, sets, units, editId, plannedWorkoutId }));
      else localStorage.removeItem("loadfactor-draft-v1" + storageSuffix);
    } catch {
      const frame = requestAnimationFrame(() => setStorageNotice("Draft could not be saved in browser storage. Keep this page open until you save or export your session."));
      return () => cancelAnimationFrame(frame);
    }
  }, [loaded, duration, sessionRpe, title, date, notes, tags, bodyweight, sets, units, editId, plannedWorkoutId, storageSuffix]);
  useEffect(() => {
    if (!request || !loaded) return;
    const frame = requestAnimationFrame(() => {
      if (sets.length && !window.confirm("Replace your unfinished draft with this session?")) { onRequestHandled(); return; }
      const source = request.session;
      setDuration(request.mode === "edit" && source.durationMinutes != null ? String(source.durationMinutes) : "");
      setSessionRpe(request.mode === "edit" && source.sessionRpe != null ? String(source.sessionRpe) : "");
      setCustom(current => [...current, ...(source.customExercises ?? [])].filter((e, i, all) => all.findIndex(x => x.id === e.id) === i));
      setPlannedWorkoutId(request.mode === "duplicate" ? null : source.plannedWorkoutId ?? null);
      setTitle(request.mode === "duplicate" ? source.title.slice(0, 73) + " (copy)" : source.title);
      setDate(request.mode === "duplicate" || request.mode === "planned" ? today : source.date); setNotes(source.notes); setTags((source.tags ?? []).join(", "));
      const weight = request.mode === "edit" ? source.bodyweightKg : defaultBodyweightKg;
      setBodyweight(weight ? String(weightFromKg(weight, weightUnit)) : "");
      setUnits({ weight: weightUnit, height: heightUnit });
      setSets(source.exercises.map(set => ({ test: set.test ?? null, broad: set.test?.broadJumpCm ? String(heightFromCm(set.test.broadJumpCm, heightUnit)) : "", distance: String(set.test?.distanceM ?? (set.exerciseId === "10m-fly" ? 10 : "")), splitsText: (set.test?.splits ?? []).map(p => p.distanceM + ":" + p.seconds).join(", "), protocol: set.test?.protocol ?? "", category: set.test?.jumpCategory ?? jumpCategory(set.exerciseId), approach: set.test?.approach ?? "standing", leg: set.test?.leg ?? "both", id: crypto.randomUUID(), exerciseId: set.exerciseId, weight: String(weightFromKg(set.weightKg, weightUnit)), reps: String(set.reps), height: set.jumpHeightCm === null ? "" : String(heightFromCm(set.jumpHeightCm, heightUnit)), time: set.splitTimeSeconds === null ? "" : String(set.splitTimeSeconds), videoUrl: set.videoUrl ?? "", rpe: set.rpe, setType: set.setType ?? "working", superset: set.superset ?? "", dropGroup: set.dropGroup ?? "", tempo: set.tempo ?? "", pause: set.pauseSeconds === null || set.pauseSeconds === undefined ? "" : String(set.pauseSeconds) })));
      setEditId(request.mode === "edit" ? source.id : undefined); setOpen(true); setStatus("idle"); setError(""); onRequestHandled();
    });
    return () => cancelAnimationFrame(frame);
  }, [request, loaded, weightUnit, heightUnit, onRequestHandled, sets.length, today, defaultBodyweightKg]);
  useEffect(() => {
    if (deadline === null) return;
    const interval = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); setRemaining(seconds);
      if (seconds === 0) { setDeadline(null); setTimerNotice("Rest complete. Ready for your next set."); }
    }, 250);
    return () => window.clearInterval(interval);
  }, [deadline]);
  function store(key: string, value: unknown) {
    if (accountId) {
      const assets = { custom: key.includes("custom-exercises") ? value : custom, templates: key.includes("templates") ? value : templates };
      assetQueue.current = assetQueue.current.then(async () => { await api("/api/account/workspace", "PUT", assets); window.dispatchEvent(new Event("loadfactor-assets")); setStorageNotice("Templates and exercises saved to your account."); }).catch(error => setStorageNotice(error instanceof Error ? error.message : "Account save failed. Try saving again before leaving."));
      return true;
    }
    try { localStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new Event("loadfactor-assets")); setStorageNotice("Saved to this browser."); return true; }
    catch { setStorageNotice("Browser storage could not save your changes. They remain available during this visit."); return false; }
  }
  function addCustom() {
    const name = customName.trim();
    if (!name) { setError("Enter an exercise name."); return; }
    if (custom.length >= 100) { setError("The custom exercise limit is 100."); return; }
    if (catalog.some(e => e.name.toLowerCase() === name.toLowerCase())) { setError("An exercise with that name already exists."); return; }
    const next = [...custom, { id: "custom-" + crypto.randomUUID(), name, kind: customKind }];
    setCustom(next); store("loadfactor-custom-exercises-v1", next); setCustomName(""); setSearch(""); setError("");
  }
  function inputData() {
    return {
      durationMinutes: duration.trim() ? Number(duration) : null, sessionRpe: sessionRpe.trim() ? Number(sessionRpe) : null,
      plannedWorkoutId, title, date, notes, bodyweightKg: bodyweight.trim() ? weightToKg(Number(bodyweight), units.weight) : null, tags: tags.split(",").map(t => t.trim()).filter(Boolean), customExercises: catalog.filter(e => e.id.startsWith("custom-") && sets.some(s => s.exerciseId === e.id)),
      exercises: sets.map(set => {
        const kind = catalog.find(e => e.id === set.exerciseId)?.kind;
        return { test: kind === "strength" ? null : { jumpCategory: set.category || jumpCategory(set.exerciseId), approach: set.approach, leg: set.leg, broadJumpCm: kind === "jump" && (set.category || jumpCategory(set.exerciseId)) === "broad" && set.broad.trim() ? heightToCm(Number(set.broad), units.height) : null, distanceM: kind === "sprint" && set.distance.trim() ? Number(set.distance) : null, splits: kind === "sprint" && set.splitsText.trim() ? set.splitsText.split(",").map(part => { const pieces = part.trim().split(":"); return { distanceM: pieces.length === 2 ? Number(pieces[0]) : NaN, seconds: pieces.length === 2 ? Number(pieces[1]) : NaN }; }) : [], protocol: set.protocol }, videoUrl: set.videoUrl.trim() || null, setType: set.setType, superset: set.superset.trim() || null, dropGroup: set.dropGroup.trim() || null, tempo: set.tempo.trim() || null, pauseSeconds: set.pause.trim() ? Number(set.pause) : null, exerciseId: set.exerciseId, weightKg: weightToKg(Number(set.weight), units.weight), reps: set.reps.trim() ? Number(set.reps) : 0, jumpHeightCm: kind === "jump" && (set.category || jumpCategory(set.exerciseId)) !== "broad" && set.height.trim() ? heightToCm(Number(set.height), units.height) : null, splitTimeSeconds: kind === "sprint" && set.time.trim() ? Number(set.time) : null, rpe: set.rpe };
      }),
    };
  }
  function saveTemplate() {
    const parsed = sessionSchemaFor(() => today).safeParse(inputData());
    if (!templateName.trim()) { setError("Name your template first."); return; }
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Complete your sets first."); return; }
    if (templates.length >= 50) { setError("The template limit is 50. Remove one first."); return; }
    const next = [...templates, { id: crypto.randomUUID(), name: templateName.trim(), input: parsed.data }];
    setTemplates(next); store("loadfactor-templates-v1", next); setTemplateName(""); setError("");
  }
  function loadTemplate(template: WorkoutTemplate) {
    setDuration(""); setSessionRpe("");
    setPlannedWorkoutId(null);
    setTitle(template.input.title); setDate(today); setNotes(template.input.notes); setTags(template.input.tags.join(", ")); setEditId(undefined);
    setBodyweight(defaultBodyweightKg ? String(defaultBodyweightKg) : "");
    setUnits({ weight: "kg", height: "cm" });
    const next = [...custom, ...template.input.customExercises].filter((e, i, all) => all.findIndex(x => x.id === e.id) === i);
    setCustom(next); store("loadfactor-custom-exercises-v1", next);
    setSets(template.input.exercises.map(set => ({ test: set.test ?? null, broad: set.test?.broadJumpCm ? String(heightFromCm(set.test.broadJumpCm, "cm")) : "", distance: String(set.test?.distanceM ?? (set.exerciseId === "10m-fly" ? 10 : "")), splitsText: (set.test?.splits ?? []).map(p => p.distanceM + ":" + p.seconds).join(", "), protocol: set.test?.protocol ?? "", category: set.test?.jumpCategory ?? jumpCategory(set.exerciseId), approach: set.test?.approach ?? "standing", leg: set.test?.leg ?? "both", id: crypto.randomUUID(), exerciseId: set.exerciseId, weight: String(set.weightKg), reps: String(set.reps), height: set.jumpHeightCm === null ? "" : String(set.jumpHeightCm), time: set.splitTimeSeconds === null ? "" : String(set.splitTimeSeconds), videoUrl: set.videoUrl ?? "", rpe: set.rpe, setType: set.setType ?? "working", superset: set.superset ?? "", dropGroup: set.dropGroup ?? "", tempo: set.tempo ?? "", pause: set.pauseSeconds === null || set.pauseSeconds === undefined ? "" : String(set.pauseSeconds) })));
    setOpen(true); setStatus("idle"); setError("");
  }
  const total = sets.reduce((sum, set) => sum + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0);
  function patch(id: string, values: Partial<SetDraft>) {
    setSets(current => current.map(set => set.id === id ? { ...set, ...values } : set));
    setStatus("idle"); setError("");
  }
  function start() {
    setOpen(true); setStatus("idle"); setError("");
    if (!sets.length) { setDuration(""); setSessionRpe(""); setBodyweight(defaultBodyweightKg ? String(weightFromKg(defaultBodyweightKg, weightUnit)) : ""); setSets([freshSet()]); setDate(today); setUnits({ weight: weightUnit, height: heightUnit }); }
    requestAnimationFrame(() => document.getElementById("session-title")?.focus());
  }
  function changeWeight(next: WeightUnit) {
    setBodyweight(current => current ? String(Number(weightFromKg(weightToKg(Number(current), units.weight), next).toFixed(2))) : "");
    setSets(current => current.map(set => ({ ...set, weight: set.weight ? String(Number(weightFromKg(weightToKg(Number(set.weight), units.weight), next).toFixed(2))) : "" })));
    setUnits(current => ({ ...current, weight: next }));
  }
  function addDrop(id: string) {
    setSets(current => {
      const index = current.findIndex(s => s.id === id), base = current[index];
      if (!base || current.length >= 100 || base.setType === "warmup" || Number(base.weight) <= 0) return current;
      const group = base.dropGroup || "DROP-" + base.id.slice(0, 6).toUpperCase();
      const anchor = { ...base, dropGroup: group };
      const drop: SetDraft = { ...anchor, id: crypto.randomUUID(), setType: "drop", weight: String(Number((Number(base.weight) * 0.8).toFixed(2))) };
      return [...current.slice(0, index), anchor, drop, ...current.slice(index + 1)];
    });
  }
  function changeHeight(next: HeightUnit) {
    setSets(current => current.map(set => ({ ...set, broad: set.broad ? String(Number(heightFromCm(heightToCm(Number(set.broad), units.height), next).toFixed(2))) : "", height: set.height ? String(Number(heightFromCm(heightToCm(Number(set.height), units.height), next).toFixed(2))) : "" })));
    setUnits(current => ({ ...current, height: next }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const input = inputData();
    const parsed = sessionSchemaFor(() => today).safeParse(input);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your session details."); return; }
    busy.current = true; setStatus("saving"); setError("");
    try {
      const response = await fetch(accountId && editId ? "/api/sessions/" + editId : "/api/sessions", { method: accountId && editId ? "PUT" : "POST", headers: { "Content-Type": "application/json", ...(accountId ? { "X-LoadFactor-Account": accountId } : {}) }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save this session.");
      onSave(result as SessionSubmission, editId);
      setEditId(undefined);
      setPlannedWorkoutId(null);
      setStatus("saved"); setSets([]); setNotes(""); setTags(""); setOpen(false);
      setDuration(""); setSessionRpe("");
    } catch (err) {
      if (accountId && !editId && err instanceof TypeError) {
        try {
          const local = createSession(parsed.data);
          local.session.userId = accountId;
          local.metrics = local.metrics.map(metric => ({ ...metric, userId: accountId }));
          await enqueueOfflineSession({ clientId: local.session.id, accountId, session: parsed.data, state: "pending" });
          onSave(local);
          setEditId(undefined); setPlannedWorkoutId(null); setStatus("saved"); setSets([]); setNotes(""); setTags(""); setOpen(false); setDuration(""); setSessionRpe("");
          setError("");
        } catch (queueError) {
          setError(queueError instanceof Error ? "Offline save failed: " + queueError.message : "Offline save failed. Your draft is still available.");
          setStatus("idle");
        }
      } else {
        setError(err instanceof Error ? err.message : "Connection failed. Your draft is still here.");
        setStatus("idle");
      }
    }
    finally { busy.current = false; }
  }
  return <section id="logger" className="panel logger-panel scroll-mt-6">
    <div className="section-title"><div className="flex items-center gap-3"><span className="icon-box"><Dumbbell size={20}/></span><div><span className="eyebrow">PUT IN THE WORK</span><h2>Session logger</h2></div></div><span className="subtle-pill">{editId ? "Editing session" : accountId ? "Account storage" : "Local demo"}</span></div>
    {storageNotice && <p className="success-message" role="status">{storageNotice}</p>}
    <div className="phase-controls">
      <label className="field-label">Workout templates<select aria-label="Load workout template" value="" disabled={!loaded || sets.length > 0} onChange={e => { const t = templates.find(t => t.id === e.target.value); if (t) loadTemplate(t); }}><option value="">Choose a template</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      {sets.length > 0 && <span className="field-label">Save or discard your draft before loading a template.</span>}
      <details><summary>Manage templates</summary>{templates.map(t => <div className="template-item" key={t.id}><span>{t.name}</span><button type="button" className="text-button" onClick={() => { const next = templates.filter(x => x.id !== t.id); setTemplates(next); store("loadfactor-templates-v1", next); }}>Remove</button></div>)}{!templates.length && <p>No templates saved yet.</p>}</details>
    </div>
    {!open ? <div className="logger-intro"><div><h3>{status === "saved" ? "Session in. Progress made." : "Your next level starts here."}</h3><p>{status === "saved" ? "Your dashboard is up to date. Keep the momentum going." : "Capture every set, sprint, and jump. Let the numbers tell your story."}</p></div><button data-open-logger className="primary-button" onClick={start} disabled={!loaded}><Plus size={16}/>{sets.length ? "Resume draft" : "Log a session"}</button></div> :
      <form onSubmit={submit}>
        <fieldset disabled={status === "saving"} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2"><label className="field-label" htmlFor="session-title">Session name<input id="session-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} required/></label><label className="field-label" htmlFor="session-date">Training date<input id="session-date" type="date" value={date} max={today} onChange={e => setDate(e.target.value)} required/></label></div>
          <label className="field-label">Session bodyweight ({units.weight}, optional)<input type="number" min="0.01" step="any" value={bodyweight} onChange={e => setBodyweight(e.target.value)} placeholder="Used for this session only"/></label>
          <div className="history-filters"><label className="field-label">Session duration (minutes, optional)<input type="number" min="0.01" max="1440" step="any" value={duration} onChange={e => setDuration(e.target.value)}/></label><label className="field-label">Overall session RPE (0-10, optional)<input type="number" min="0" max="10" step="any" value={sessionRpe} onChange={e => setSessionRpe(e.target.value)}/></label></div>
          <p className="account-description">Rate the whole session separately from individual sets. Session load: {sessionTrainingLoad({ durationMinutes: duration.trim() ? Number(duration) : null, sessionRpe: sessionRpe.trim() ? Number(sessionRpe) : null })?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? "enter duration and session RPE"} arbitrary units (minutes x session RPE).</p>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-400">One row per set. Add as many as you need.</p><div className="flex gap-2"><label className="sr-only" htmlFor="log-weight-unit">Logging weight unit</label><select id="log-weight-unit" value={units.weight} onChange={e => changeWeight(e.target.value as WeightUnit)}><option value="kg">kg</option><option value="lbs">lbs</option></select><label className="sr-only" htmlFor="log-height-unit">Logging jump unit</label><select id="log-height-unit" value={units.height} onChange={e => changeHeight(e.target.value as HeightUnit)}><option value="in">inches</option><option value="cm">cm</option></select></div></div>
          <div className="phase-controls">
            <label className="field-label">Search exercises<input type="search" placeholder="Filter exercise choices" value={search} onChange={e => setSearch(e.target.value)}/></label>
            <details><summary>Create custom exercise</summary><label className="field-label">Exercise name<input value={customName} maxLength={80} onChange={e => setCustomName(e.target.value)}/></label><label className="field-label">Category<select value={customKind} onChange={e => setCustomKind(e.target.value as ExerciseKind)}><option value="strength">Strength</option><option value="jump">Jump</option><option value="sprint">Sprint</option></select></label><button type="button" className="secondary-button" onClick={addCustom}>Create exercise</button></details>
            <div className="rest-timer"><label className="field-label">Rest duration (seconds)<input type="number" min="5" max="3600" value={restDuration} onChange={e => setRestDuration(Number(e.target.value))}/></label><output aria-label="Rest time remaining">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</output><button type="button" className="secondary-button" disabled={!Number.isInteger(restDuration) || restDuration < 5 || restDuration > 3600} onClick={() => { setRemaining(restDuration); setDeadline(Date.now() + restDuration * 1000); setTimerNotice(""); }}>Start / restart</button><button type="button" className="text-button" onClick={() => { setDeadline(null); setTimerNotice("Timer stopped."); }}>Stop</button><span role="status">{timerNotice}</span></div>
          </div>
          <div className="space-y-3">{sets.map((set, index) => {
            const kind = catalog.find(e => e.id === set.exerciseId)?.kind;
            return <div key={set.id} className="set-row">
              <div className="set-top"><span className="set-number">SET {String(index + 1).padStart(2, "0")} - {set.setType}{set.superset ? " | Superset " + set.superset : ""}{set.dropGroup ? " | " + set.dropGroup : ""}</span><div className="flex gap-2"><button type="button" className="text-button" aria-label={"Move set " + (index + 1) + " up"} disabled={index === 0} onClick={() => setSets(current => moveSet(current, index, -1))}>Up</button><button type="button" className="text-button" aria-label={"Move set " + (index + 1) + " down"} disabled={index === sets.length - 1} onClick={() => setSets(current => moveSet(current, index, 1))}>Down</button><button type="button" className="icon-button" aria-label={"Remove set " + (index + 1)} onClick={() => setSets(current => current.filter(s => s.id !== set.id))}><Trash2 size={15}/></button></div></div>
              <div className="set-fields">
                <label className="field-label">Exercise<select value={set.exerciseId} onChange={e => patch(set.id, { ...freshSet(e.target.value), exerciseId: e.target.value, id: set.id, setType: "working", superset: "", dropGroup: "", tempo: "", pause: "", height: "", time: "", weight: "", reps: catalog.find(x => x.id === e.target.value)?.kind === "strength" ? "5" : "1" })}>{catalog.filter(e => e.id === set.exerciseId || e.name.toLowerCase().includes(search.toLowerCase())).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
                <label className="field-label">Weight ({units.weight})<input type="number" min="0" step="any" placeholder="0" value={set.weight} onChange={e => patch(set.id, { weight: e.target.value })}/></label>
                <label className="field-label">Reps<input type="number" min="1" max="1000" step="1" value={set.reps} required onChange={e => patch(set.id, { reps: e.target.value })}/></label>
                <label className="field-label">Jump ({units.height})<input type="number" min="0.01" step="any" placeholder={kind === "jump" ? "Height" : "—"} disabled={kind !== "jump" || set.category === "broad"} required={kind === "jump" && set.category !== "broad"} value={set.height} onChange={e => patch(set.id, { height: e.target.value })}/></label>
                <label className="field-label">Split (sec)<input type="number" min="0.001" step="any" placeholder={kind === "sprint" ? "Time" : "—"} disabled={kind !== "sprint"} required={kind === "sprint"} value={set.time} onChange={e => patch(set.id, { time: e.target.value })}/></label>
                <label className="field-label rpe-field">RPE <span className="rpe-value">{set.rpe}/10</span><input type="range" min="1" max="10" step="1" value={set.rpe} aria-label={"RPE for set " + (index + 1)} onChange={e => patch(set.id, { rpe: Number(e.target.value) })}/></label>
              </div>
              <label className="field-label">Technique video link (HTTPS)<input type="url" inputMode="url" placeholder="https://…" maxLength={2048} value={set.videoUrl} onChange={e => patch(set.id, { videoUrl: e.target.value })}/></label>
              {kind !== "strength" && <details className="strength-set-details" open><summary>Jump / sprint test details</summary><p className="account-description">Log one measured attempt per row. Keep protocol notes identical when comparing tests.</p><div className="history-filters">
                {kind === "jump" && <><label className="field-label">Jump category<select value={set.category || jumpCategory(set.exerciseId)} onChange={e => patch(set.id, { category: e.target.value, height: "", broad: "" })}>{["countermovement", "squat", "depth", "vertical", "broad"].map(c => <option key={c}>{c}</option>)}</select></label><label className="field-label">Takeoff<select value={set.approach} onChange={e => patch(set.id, { approach: e.target.value })}><option value="standing">Standing</option><option value="approach">Approach</option></select></label><label className="field-label">Leg<select value={set.leg} onChange={e => patch(set.id, { leg: e.target.value })}><option value="both">Both legs</option><option value="left">Left leg</option><option value="right">Right leg</option></select></label>{set.category === "broad" && <label className="field-label">Broad jump distance ({units.height})<input type="number" step="any" min="0.01" required value={set.broad} onChange={e => patch(set.id, { broad: e.target.value })}/></label>}</>}
                {kind === "sprint" && <><label className="field-label">Sprint distance (m)<input type="number" step="any" min="0.01" max="10000" required value={set.distance} onChange={e => patch(set.id, { distance: e.target.value })}/></label><label className="field-label">Cumulative splits (metres:seconds)<input value={set.splitsText} maxLength={2000} placeholder="10:1.8, 20:3.2" onChange={e => patch(set.id, { splitsText: e.target.value })}/></label></>}
                <label className="field-label">Test protocol notes<textarea value={set.protocol} maxLength={1000} rows={2} placeholder="Surface, footwear, timing device, start, arm swing, rest, measurement method" onChange={e => patch(set.id, { protocol: e.target.value })}/></label>
              </div></details>}
              {kind === "strength" && <details className="strength-set-details"><summary>Strength set details</summary><div className="history-filters">
                <label className="field-label">Set classification<select value={set.setType} onChange={e => patch(set.id, { setType: e.target.value as SetType, dropGroup: e.target.value === "warmup" ? "" : set.dropGroup })}><option value="working">Working</option><option value="warmup">Warm-up</option><option value="drop">Drop stage</option></select></label>
                <label className="field-label">Superset label<input value={set.superset} maxLength={12} placeholder="e.g. A (two exercises)" onChange={e => patch(set.id, { superset: e.target.value.toUpperCase() })}/></label>
                <label className="field-label">Drop group<input value={set.dropGroup} maxLength={16} placeholder="Filled by Add drop stage" onChange={e => patch(set.id, { dropGroup: e.target.value.toUpperCase() })}/></label>
                <label className="field-label">Tempo (lower-bottom-lift-top)<input value={set.tempo} maxLength={20} placeholder="3-1-X-0" onChange={e => patch(set.id, { tempo: e.target.value.toUpperCase() })}/></label>
                <label className="field-label">Additional pause (seconds)<input type="number" min="0" max="60" step="any" value={set.pause} onChange={e => patch(set.id, { pause: e.target.value })}/></label>
                <label className="field-label">Your saved alternatives<select value="" onChange={e => { if (e.target.value) patch(set.id, { exerciseId: e.target.value, weight: "", setType: "working", dropGroup: "", tempo: "", pause: "" }); }}><option value="">Choose a substitution</option>{(strengthSettings.alternatives[set.exerciseId] ?? []).filter(id => catalog.some(e => e.id === id && e.kind === "strength")).map(id => <option value={id} key={id}>{catalog.find(e => e.id === id)?.name}</option>)}</select></label>
              </div><button type="button" className="secondary-button" disabled={sets.length >= 100 || set.setType === "warmup" || Number(set.weight) <= 0} onClick={() => addDrop(set.id)}>Add drop stage (20% lighter)</button><p className="account-description">Adjust the generated load and reps as needed. Drop stages require a preceding heavier set in the same group. Give two different exercises the same superset label to group them.</p></details>}
              {sets.findIndex(s => s.exerciseId === set.exerciseId) === index && <div className="phase-controls"><span className="field-label">Move entire exercise:</span><button type="button" className="text-button" disabled={[...new Set(sets.map(s => s.exerciseId))].indexOf(set.exerciseId) === 0} onClick={() => setSets(current => moveExercise(current, set.exerciseId, -1))}>Exercise up</button><button type="button" className="text-button" disabled={[...new Set(sets.map(s => s.exerciseId))].at(-1) === set.exerciseId} onClick={() => setSets(current => moveExercise(current, set.exerciseId, 1))}>Exercise down</button></div>}
              <p className="previous-set">{(() => {
                const prior = [...sessions].filter(s => s.id !== editId && s.date <= date && s.exercises.some(e => e.exerciseId === set.exerciseId)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))[0];
                if (!prior) return "No previous results for this exercise.";
                const results = prior.exercises.filter(e => e.exerciseId === set.exerciseId);
                return "Previous (" + prior.date + "): " + results.map(e => weightFromKg(e.weightKg, units.weight).toFixed(1) + " " + units.weight + " x " + e.reps + (e.jumpHeightCm === null ? "" : " | " + heightFromCm(e.jumpHeightCm, units.height).toFixed(1) + " " + units.height) + (e.splitTimeSeconds === null ? "" : " | " + e.splitTimeSeconds + " sec") + " | RPE " + e.rpe).join("; ");
              })()}</p>
            </div>;
          })}</div>
          <button type="button" className="secondary-button" disabled={sets.length >= 100} onClick={() => setSets(current => [...current, { ...freshSet(current.at(-1)?.exerciseId), category: current.at(-1)?.category ?? "vertical", approach: current.at(-1)?.approach ?? "standing", leg: current.at(-1)?.leg ?? "both", distance: current.at(-1)?.distance ?? "", protocol: current.at(-1)?.protocol ?? "", reps: catalog.find(e => e.id === current.at(-1)?.exerciseId)?.kind === "strength" ? "5" : "1" }])}><Plus size={15}/>Add set</button>
          <div className="phase-controls"><label className="field-label">Template name<input value={templateName} maxLength={80} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. Lower body power"/></label><button type="button" className="secondary-button" onClick={saveTemplate}>Save workout template</button></div>
          <label className="field-label">Session tags<input value={tags} maxLength={300} placeholder="e.g. power, preseason (up to 10 tags)" onChange={e => setTags(e.target.value)}/></label>
          <label className="field-label" htmlFor="session-notes">Session notes <span className="text-slate-600">(optional)</span><textarea id="session-notes" placeholder="How did you feel? Any wins or adjustments?" maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} rows={2}/></label>
          <div className="logger-bottom"><div><span className="eyebrow">SESSION VOLUME</span><p className="volume-total">{total.toLocaleString(undefined, { maximumFractionDigits: 1 })}<span>{units.weight} · weight × reps</span></p></div><div className="flex gap-3"><button type="button" className="text-button" onClick={() => { setSets([]); setDuration(""); setSessionRpe(""); setEditId(undefined); setPlannedWorkoutId(null); setNotes(""); setTags(""); setTitle("Afternoon training"); setOpen(false); }}>Discard draft</button><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Close</button><button className="primary-button" type="submit" disabled={!sets.length}>{status === "saving" ? <><LoaderCircle size={16} className="animate-spin"/>Saving…</> : <>{editId ? "Save changes" : "Save session"}<ArrowRight size={16}/></>}</button></div></div>
        </fieldset>
        {error && <p className="error-message" role="alert">{error}</p>}
      </form>}
    {status === "saved" && <p className="success-message" role="status"><Check size={15}/>{accountId ? "Session saved to your account." : "Session saved to this browser."}</p>}
  </section>;
}
