"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileText, Plus, Printer, Save, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { useFirebaseUser } from "./firebase-auth";
import { api } from "@/lib/client-api";
import { exercises } from "@/lib/exercises";
import { parseDate } from "@/lib/analytics";
import { planningSchema, type Planning, type WorkoutDocument } from "@/lib/planning";
import { formIssueMessage } from "@/lib/form-numbers";

const freshRow = (): WorkoutDocument["rows"][number] => ({ id: crypto.randomUUID(), name: "", sets: 1, reps: "", load: "", rest: "", instructions: "" });
const blank = (date: string): WorkoutDocument => ({ id: crypto.randomUUID(), date, title: "", objective: "", warmup: "", cooldown: "", notes: "", rows: [freshRow()] });

export default function WorkoutDocumentPage({ planning, onPlanning, today, accountId }: { planning: Planning; onPlanning: (value: Planning) => void; today: string; accountId?: string }) {
  const firebaseUser = useFirebaseUser();
  const storageKey = "loadfactor-planning-v1" + (firebaseUser ? ":firebase:" + firebaseUser.uid : "");
  const [document, setDocument] = useState<WorkoutDocument | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const initialPlanning = useRef(planning);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = !accountId ? localStorage.getItem(storageKey) : null;
        const loaded = raw ? planningSchema.parse(JSON.parse(raw)) : initialPlanning.current;
        if (raw) onPlanning(loaded);
        const query = new URLSearchParams(window.location.search);
        const requestedDate = query.get("date");
        const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today;
        const selected = loaded.documents.find(item => item.id === query.get("document"));
        setDocument(selected ? structuredClone(selected) : blank(date));
        setPreview(!!selected);
        setReady(true);
      } catch { setError("Saved planning data could not be read. Reload before saving a new plan."); }
    });
    return () => cancelAnimationFrame(frame);
  }, [accountId, storageKey, today, onPlanning]);

  function change(values: Partial<WorkoutDocument>) { setDocument(current => current ? { ...current, ...values } : null); setDirty(true); setNotice(""); setError(""); }
  function rowChange(id: string, values: Partial<WorkoutDocument["rows"][number]>) { if (document) change({ rows: document.rows.map(row => row.id === id ? { ...row, ...values } : row) }); }
  function moveRow(index: number, offset: number) {
    if (!document) return;
    const rows = [...document.rows], destination = index + offset;
    if (destination < 0 || destination >= rows.length) return;
    [rows[index], rows[destination]] = [rows[destination], rows[index]];
    change({ rows });
  }
  async function persist(next: Planning) {
    if (!ready || busy) return false;
    const parsed = planningSchema.safeParse(next);
    if (!parsed.success) { setError(formIssueMessage(parsed.error.issues[0])); return false; }
    setBusy(true); setError("");
    try {
      const result = accountId ? (await api<{ planning: Planning }>("/api/account/planning", "PUT", parsed.data)).planning : parsed.data;
      if (!accountId) localStorage.setItem(storageKey, JSON.stringify(result));
      onPlanning(result); return true;
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save the workout plan."); return false; }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!document) return;
    if (await persist({ ...planning, documents: [...planning.documents.filter(item => item.id !== document.id), document] })) {
      setDirty(false); setPreview(true); setNotice("Workout plan saved to your schedule. This is a plan; it does not count as a completed workout.");
    }
  }
  function open(next: WorkoutDocument) {
    if (dirty && !window.confirm("You have unsaved changes. Leave this draft?")) return;
    setDocument(structuredClone(next)); setDirty(false); setPreview(true); setNotice(""); setError("");
  }
  function newDocument() {
    if (dirty && !window.confirm("You have unsaved changes. Start a new document?")) return;
    setDocument(blank(document?.date ?? today)); setDirty(false); setPreview(false); setNotice(""); setError("");
  }
  const scheduled = [...planning.documents].sort((a, b) => a.date.localeCompare(b.date));
  if (!document) return <p role="status">{error || "Opening your workout document…"}</p>;

  return <div className="workout-document-workspace">
    <div className="document-toolbar"><div><FileText size={20}/><span>{dirty ? "Unsaved changes" : planning.documents.some(item => item.id === document.id) ? "Saved workout plan" : "New workout plan"}</span></div><div className="flex flex-wrap gap-2"><button className="secondary-button" type="button" onClick={newDocument} disabled={busy}>New document</button><button className="secondary-button" type="button" aria-pressed={preview} onClick={() => setPreview(value => !value)}>{preview ? "Edit document" : "Preview"}</button><button className="secondary-button" type="button" onClick={() => { setPreview(true); window.requestAnimationFrame(() => window.print()); }}><Printer size={16}/>Print / PDF</button></div></div>
    {error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="success-message" role="status">{notice}</p>}
    <div className="document-layout">
      <aside className="document-library"><h2>Your workout documents</h2><p>Plan first. Record your actual results in Log workout after training.</p>{!scheduled.length && <p className="document-library-empty">No documents yet. Create your first daily workout.</p>}{scheduled.map(item => <div className="document-library-item" key={item.id}><button type="button" onClick={() => open(item)} aria-current={item.id === document.id ? "true" : undefined}><strong>{item.title}</strong><span>{parseDate(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {item.rows.length} exercises</span></button><button type="button" className="icon-button" aria-label={"Delete " + item.title} disabled={busy} onClick={async () => { if (!window.confirm(`Delete the workout plan “${item.title}”?`)) return; if (await persist({ ...planning, documents: planning.documents.filter(doc => doc.id !== item.id) })) { if (item.id === document.id) { setDocument(blank(item.date)); setPreview(false); setDirty(false); } setNotice("Workout document deleted."); } }}><Trash2 size={16}/></button></div>)}</aside>
      <form className="workout-paper print-report" onSubmit={event => void save(event)}>
        <fieldset disabled={busy || !ready}>
          <div className="paper-masthead"><span>LOADFACTOR / DAILY WORKOUT</span><span>TRAINING PLAN</span></div>
          {preview ? <><h2 className="paper-title">{document.title || "Untitled workout"}</h2><p className="paper-date">{parseDate(document.date).toLocaleDateString("en-US", { dateStyle: "long" })}</p></> : <><label className="field-label">Workout title<input className="paper-title-input" required maxLength={80} value={document.title} placeholder="e.g. Lower body strength" onChange={event => change({ title: event.target.value })}/></label><label className="field-label paper-date-field">Training date<input type="date" required value={document.date} onChange={event => change({ date: event.target.value })}/></label></>}
          <DocumentText title="01 / Session objective" value={document.objective} preview={preview} limit={1000} placeholder="What do you want to work on today?" onChange={objective => change({ objective })}/>
          <DocumentText title="02 / Warm-up" value={document.warmup} preview={preview} limit={2000} placeholder="Write your warm-up activities, duration and preparation." onChange={warmup => change({ warmup })}/>
          <section className="paper-section"><h3>03 / Main workout</h3>{!preview && <p className="paper-help">Arrange exercises in training order. Use reps, time or distance; load and rest are optional.</p>}
            <datalist id="document-exercises">{exercises.map(exercise => <option key={exercise.id} value={exercise.name}/>)}</datalist>
            {document.rows.map((row, index) => <div className="paper-exercise" key={row.id}>
              <div className="paper-exercise-header"><span>{String(index + 1).padStart(2, "0")}</span>{preview ? <h4>{row.name || "Exercise not named"}</h4> : <label className="field-label"><span className="sr-only">Exercise {index + 1}</span><input list="document-exercises" required maxLength={80} value={row.name} placeholder="Choose or type an exercise" onChange={event => rowChange(row.id, { name: event.target.value })}/></label>}{!preview && <div className="paper-row-actions"><button className="icon-button" type="button" aria-label={`Move exercise ${index + 1} up`} disabled={index === 0} onClick={() => moveRow(index, -1)}><ArrowUp size={16}/></button><button className="icon-button" type="button" aria-label={`Move exercise ${index + 1} down`} disabled={index === document.rows.length - 1} onClick={() => moveRow(index, 1)}><ArrowDown size={16}/></button><button className="icon-button" type="button" aria-label={`Remove exercise ${index + 1}`} disabled={document.rows.length === 1} onClick={() => change({ rows: document.rows.filter(item => item.id !== row.id) })}><Trash2 size={16}/></button></div>}</div>
              {preview ? <dl className="paper-prescription"><div><dt>Sets</dt><dd>{row.sets}</dd></div><div><dt>Reps / time / distance</dt><dd>{row.reps || "Not specified"}</dd></div><div><dt>Load / intensity</dt><dd>{row.load || "Not specified"}</dd></div><div><dt>Rest</dt><dd>{row.rest || "Not specified"}</dd></div></dl> : <div className="paper-prescription"><label className="field-label">Sets<input type="number" min="1" max="100" required value={row.sets || ""} onChange={event => rowChange(row.id, { sets: Number(event.target.value) })}/></label><label className="field-label">Reps / time / distance<input required maxLength={80} value={row.reps} placeholder="e.g. 8 reps or 20 m" onChange={event => rowChange(row.id, { reps: event.target.value })}/></label><label className="field-label">Load / intensity<input maxLength={80} value={row.load} placeholder="e.g. 40 kg or bodyweight" onChange={event => rowChange(row.id, { load: event.target.value })}/></label><label className="field-label">Rest<input maxLength={80} value={row.rest} placeholder="e.g. 90 seconds" onChange={event => rowChange(row.id, { rest: event.target.value })}/></label></div>}
              {preview ? row.instructions && <p className="paper-text">{row.instructions}</p> : <label className="field-label">Exercise instructions<textarea maxLength={500} rows={2} value={row.instructions} placeholder="Technique cues, tempo or adjustments…" onChange={event => rowChange(row.id, { instructions: event.target.value })}/></label>}
            </div>)}
            {!preview && <button type="button" className="secondary-button" disabled={document.rows.length >= 100} onClick={() => change({ rows: [...document.rows, freshRow()] })}><Plus size={16}/>Add exercise</button>}
          </section>
          <DocumentText title="04 / Cool-down" value={document.cooldown} preview={preview} limit={2000} placeholder="Write your cool-down, mobility or recovery activities." onChange={cooldown => change({ cooldown })}/>
          <DocumentText title="05 / Notes & reminders" value={document.notes} preview={preview} limit={3000} placeholder="Equipment, location, coaching notes or anything to remember." onChange={notes => change({ notes })}/>
          <div className="paper-footer report-actions"><p>Planning targets only. Completed workout metrics come from your actual logged results.</p>{!preview && <button type="submit" className="primary-button"><Save size={16}/>{busy ? "Saving…" : "Save to schedule"}</button>}{preview && <button type="button" className="secondary-button" onClick={() => setPreview(false)}>Edit workout plan</button>}</div>
        </fieldset>
      </form>
    </div>
  </div>;
}

function DocumentText({ title, value, preview, limit, placeholder, onChange }: { title: string; value: string; preview: boolean; limit: number; placeholder: string; onChange: (value: string) => void }) {
  return <section className="paper-section"><h3>{title}</h3>{preview ? <p className="paper-text">{value || "Not specified"}</p> : <label className="field-label"><span className="sr-only">{title}</span><textarea value={value} maxLength={limit} rows={3} placeholder={placeholder} onChange={event => onChange(event.target.value)}/></label>}</section>;
}
