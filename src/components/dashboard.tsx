"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import BrandMark from "./brand-mark";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { useFirebaseUser } from "./firebase-auth";
import { Activity, ArrowDownRight, ArrowUpRight, ChevronRight, Dumbbell, Flame, Gauge, LayoutDashboard, MoveUpRight, Plus, Settings2, Timer, TrendingUp, Zap } from "lucide-react";
import PerformanceCharts from "./performance-charts";
import SessionLogger from "./session-logger";
import WorkoutResults from "./workout-results";
import CoachingPanel from "./coaching-panel";
import AccountPanel from "./account-panel";
import TrainingHistory from "./training-history";
import TestAnalysis from "./test-analysis";
import TrainingPlanner from "./training-planner";
import WellnessDashboard from "./wellness-dashboard";
import type { WellnessCheckIn } from "@/lib/wellness";
import { emptyPlanning, type PlannedWorkout, type Planning } from "@/lib/planning";
import StrengthDashboard from "./strength-dashboard";
import { emptyStrengthSettings } from "@/lib/strength";
import type { StrengthSettings } from "@/lib/validation";
import { api, downloadJson } from "@/lib/client-api";
import { athleteToday, type AccountUser, type AccountWorkspace } from "@/lib/account-types";
import { chartData, heightFromCm, parseDate, summarize, weightFromKg } from "@/lib/analytics";
import { demoUser } from "@/lib/exercises";
import type { HeightUnit, PerformanceMetric, SessionSubmission, WeightUnit, WorkoutSession } from "@/lib/types";
import { createSession } from "@/lib/sessions";
import { markOfflineConflict, offlineSessions, removeOfflineSession, type OfflineSession } from "@/lib/offline-queue";
import { sessionInputSchema } from "@/lib/validation";
import { rebuildRecord, type LoggerRequest } from "@/lib/workspace";
import SessionCsvTools from "./session-csv-tools";
import type { SessionInput } from "@/lib/validation";
interface Data { sessions: WorkoutSession[]; metrics: PerformanceMetric[] }
const STORAGE_KEY = "loadfactor-sessions-v1";
const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 0 });
const sections = [
  { id: "overview", label: "Home", description: "Record a workout, plan your week, or check your progress.", icon: LayoutDashboard },
  { id: "logger", label: "Log workout", description: "Name your workout, add your sets, then save your session.", icon: Dumbbell },
  { id: "history", label: "Training history", description: "Review, compare, and export your training sessions.", icon: Activity },
  { id: "coaching", label: "Coaches & teams", description: "Manage coaching connections, teams, and shared progress.", icon: Activity },
  { id: "wellness", label: "Wellness", description: "Track daily wellness and training load.", icon: Activity },
  { id: "planning", label: "Schedule & goals", description: "Plan training blocks, scheduled sessions, and goals.", icon: Activity },
  { id: "tests", label: "Jump & sprint", description: "Review measured jump and sprint performance.", icon: Zap },
  { id: "strength", label: "Strength", description: "Explore strength trends, records, and exercise settings.", icon: Dumbbell },
  { id: "settings", label: "Settings", description: "Manage your account, data, and display preferences.", icon: Settings2 },
] as const;
type SectionId = (typeof sections)[number]["id"];
export type DashboardSection = SectionId;
function readSavedSessions(storageKey: string): SessionSubmission[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return [];
  const entries: unknown = JSON.parse(raw);
  if (!Array.isArray(entries)) return [];
  return entries.flatMap(entry => {
    if (!entry || typeof entry !== "object" || !("session" in entry)) return [];
    const stored = entry as SessionSubmission;
    const parsed = sessionInputSchema.safeParse(stored.session);
    if (!parsed.success || typeof stored.session.id !== "string") return [];
    const rebuilt = createSession(parsed.data);
    rebuilt.session.id = stored.session.id;
    rebuilt.metrics = rebuilt.metrics.map(metric => ({ ...metric, sessionId: stored.session.id }));
    return [rebuilt];
  });
}
export default function Dashboard({ initialData, today: initialToday, account, initialWorkspace, section = "overview" }: { initialData: Data; today: string; account: AccountUser | null; initialWorkspace: AccountWorkspace | null; section?: SectionId }) {
  const firebaseUser = useFirebaseUser();
  const browserStorageSuffix = firebaseUser ? ":firebase:" + firebaseUser.uid : "";
  const browserWorkspaceKey = "loadfactor-workspace-v2" + browserStorageSuffix;
  const [today, setToday] = useState(initialToday);
  const [saved, setSaved] = useState<SessionSubmission[]>(initialWorkspace?.records ?? []);
  const [hidden, setHidden] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<{ id: string; record?: SessionSubmission } | null>(null);
  const [completedWorkout, setCompletedWorkout] = useState<WorkoutSession | null>(null);
  const [request, setRequest] = useState<LoggerRequest | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(account?.weightUnit ?? "kg");
  const [heightUnit, setHeightUnit] = useState<HeightUnit>(account?.heightUnit ?? "in");
  const [strengthSettings, setStrengthSettings] = useState<StrengthSettings>(initialWorkspace?.strengthSettings ?? emptyStrengthSettings);
  const [planning, setPlanning] = useState(initialWorkspace?.planning ?? emptyPlanning);
  const [wellness, setWellness] = useState<WellnessCheckIn[]>(initialWorkspace?.wellness ?? []);
  const [range, setRange] = useState(30);
  const [active, setActive] = useState<SectionId>(section);
  const [offlineQueue, setOfflineQueue] = useState<OfflineSession[]>([]);
  const mutationEpoch = useRef(0);
  const mutations = useRef(0);
  useEffect(() => {
    const syncSection = () => {
      const segment = window.location.pathname.split("/").filter(Boolean)[0];
      setActive(sections.some(item => item.id === segment) ? segment as SectionId : "overview");
    };
    window.addEventListener("popstate", syncSection);
    return () => window.removeEventListener("popstate", syncSection);
  }, []);
  const updatePlanning = useCallback((value: Planning) => { mutationEpoch.current++; setPlanning(value); }, []);
  const updateWellness = useCallback((value: WellnessCheckIn[]) => { mutationEpoch.current++; setWellness(value); }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
    if (account) { setReady(true); return; }
    try {
      const raw = localStorage.getItem(browserWorkspaceKey);
      if (raw) {
        const state = JSON.parse(raw);
        if (!Array.isArray(state.records) || !Array.isArray(state.hidden)) throw new Error("Invalid workspace");
        setSaved(state.records.flatMap((v: unknown) => { const r = rebuildRecord(v); return r ? [r] : []; }));
        setHidden(state.hidden.filter((v: unknown) => typeof v === "string"));
      } else setSaved(readSavedSessions(STORAGE_KEY + browserStorageSuffix));
    }
    catch { setStorageError("Browser storage is unavailable or unreadable. New sessions will remain available during this visit."); }
    setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [account, browserWorkspaceKey, browserStorageSuffix]);
  useEffect(() => {
    if (!account) return;
    let stopped = false, inFlight = false;
    try { localStorage.setItem("loadfactor-offline-account-id", account.id); localStorage.setItem("loadfactor-offline-max-date", today); } catch { window.setTimeout(() => setStorageError("This browser cannot store the account link needed by offline logging."), 0); }
    const asLocalRecord = (item: OfflineSession): SessionSubmission => {
      const result = createSession(item.session);
      result.session.id = item.clientId; result.session.userId = account!.id;
      result.metrics = result.metrics.map(metric => ({ ...metric, sessionId: item.clientId, userId: account!.id }));
      return result;
    };
    async function sync() {
      if (inFlight || mutations.current > 0) return; inFlight = true;
      const epoch = mutationEpoch.current;
      try {
        const workspace = await api<AccountWorkspace>("/api/account/workspace");
        if (!stopped && epoch === mutationEpoch.current && mutations.current === 0) { setSaved(workspace.records); setPlanning(workspace.planning); setWellness(workspace.wellness); setToday(athleteToday(account!.timezone)); setStorageError(""); }
        let queued = await offlineSessions(account!.id);
        if (stopped) return;
        setOfflineQueue(queued);
        if (navigator.onLine) for (const item of queued.filter(entry => entry.state === "pending")) {
          const response = await fetch("/api/sessions/sync", { method: "POST", headers: { "Content-Type": "application/json", "X-LoadFactor-Account": account!.id }, body: JSON.stringify({ clientId: item.clientId, session: item.session }) });
          const result = await response.json();
          if (response.status === 409 && result.record) await markOfflineConflict(item.clientId, result.record as SessionSubmission);
          else if (!response.ok) throw new Error(result.error ?? "Offline session sync failed.");
          else {
            await removeOfflineSession(item.clientId);
            if (!stopped) setSaved(current => [...current.filter(record => record.session.id !== item.clientId && record.session.id !== result.session.id), result as SessionSubmission]);
          }
        }
        queued = await offlineSessions(account!.id);
        if (!stopped) {
          setOfflineQueue(queued);
          const local = queued.filter(item => item.state === "pending").map(asLocalRecord);
          setSaved(current => [...current.filter(record => !local.some(entry => entry.session.id === record.session.id)), ...local]);
        }
      }
      catch (error) { if (!stopped) setStorageError(error instanceof Error ? error.message : "Sync failed. Your displayed sessions remain available."); }
      finally { inFlight = false; }
    }
    const interval = window.setInterval(() => void sync(), 15000);
    window.addEventListener("focus", sync); window.addEventListener("online", sync); window.addEventListener("loadfactor-sync", sync); window.addEventListener("loadfactor-offline-queued", sync);
    void sync();
    return () => { stopped = true; clearInterval(interval); window.removeEventListener("focus", sync); window.removeEventListener("online", sync); window.removeEventListener("loadfactor-sync", sync); window.removeEventListener("loadfactor-offline-queued", sync); };
  }, [account, today]);
  async function resolveOfflineConflict(item: OfflineSession, resolution: "server" | "local") {
    if (!account || !item.serverRecord) return;
    try {
      const response = await fetch("/api/sessions/sync", { method: "POST", headers: { "Content-Type": "application/json", "X-LoadFactor-Account": account.id }, body: JSON.stringify({ clientId: item.clientId, session: item.session, resolution }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not resolve this offline conflict.");
      await removeOfflineSession(item.clientId);
      setSaved(current => [...current.filter(record => record.session.id !== item.clientId && record.session.id !== result.session.id), result as SessionSubmission]);
      setOfflineQueue(await offlineSessions(account.id));
      setStorageError("");
    } catch (error) { setStorageError(error instanceof Error ? error.message : "Could not resolve this offline conflict."); }
  }
  const data = useMemo(() => ({
    sessions: [...initialData.sessions.filter(s => !hidden.includes(s.id) && !saved.some(r => r.session.id === s.id)), ...saved.map(s => s.session)],
    metrics: [...initialData.metrics.filter(m => !hidden.includes(m.sessionId) && !saved.some(r => r.session.id === m.sessionId)), ...saved.flatMap(s => s.metrics)],
  }), [initialData, saved, hidden]);
  const summary = summarize(data.sessions, data.metrics, today);
  const charts = chartData(data.sessions, data.metrics, today, range);
  function persist(next: SessionSubmission[], removed: string[]) {
    setSaved(next); setHidden(removed);
    if (account) return;
    try { localStorage.setItem(browserWorkspaceKey, JSON.stringify({ records: next, hidden: removed })); setStorageError(""); }
    catch { setStorageError("Changes are available during this visit, but could not be saved. Export your data before leaving."); }
  }
  function onSave(result: SessionSubmission, editId?: string) {
    mutationEpoch.current++;
    if (account) { setSaved(current => [...current.filter(r => r.session.id !== result.session.id), result]); setRequest(null); return; }
    if (editId) { result.session.id = editId; result.metrics = result.metrics.map(m => ({ ...m, sessionId: editId })); }
    persist([...saved.filter(r => r.session.id !== result.session.id), result], hidden.filter(id => id !== result.session.id));
    setRequest(null);
  }
  async function removeSession(id: string) {
    if (account) {
      mutationEpoch.current++; mutations.current++;
      try {
        await api("/api/sessions/" + id, "DELETE");
        setDeleted({ id }); setSaved(current => current.filter(r => r.session.id !== id)); setStorageError("");
      } catch (error) { setStorageError(error instanceof Error ? error.message : "Delete failed."); }
      finally { mutationEpoch.current++; mutations.current--; }
      return;
    }
    setDeleted({ id, record: saved.find(r => r.session.id === id) });
    persist(saved.filter(r => r.session.id !== id), [...hidden.filter(v => v !== id), id]);
  }
  async function undoDelete() {
    if (!deleted) return;
    if (account) {
      mutationEpoch.current++; mutations.current++;
      try {
        const record = await api<SessionSubmission>("/api/sessions/" + deleted.id, "POST");
        setSaved(current => [...current.filter(r => r.session.id !== record.session.id), record]); setDeleted(null); setStorageError("");
      } catch (error) { setStorageError(error instanceof Error ? error.message : "Restore failed."); }
      finally { mutationEpoch.current++; mutations.current--; }
      return;
    }
    persist(deleted.record ? [...saved, deleted.record] : saved, hidden.filter(id => id !== deleted.id)); setDeleted(null);
  }
  function openSession(session: WorkoutSession, mode: "edit" | "duplicate") {
    setCompletedWorkout(null); setRequest({ session, mode }); navigate("logger");
  }
  function startPlanned(plan: PlannedWorkout) {
    const result = createSession({ ...plan.input, date: today, plannedWorkoutId: plan.id });
    setCompletedWorkout(null); setRequest({ session: result.session, mode: "planned" }); navigate("logger");
  }
  async function linkPlanned(session: WorkoutSession, planId: string | null) {
    const input = sessionInputSchema.parse({ ...session, plannedWorkoutId: planId });
    if (account) {
      mutationEpoch.current++; mutations.current++;
      try {
        const response = await fetch("/api/sessions/" + session.id, { method: "PUT", headers: { "Content-Type": "application/json", "X-LoadFactor-Account": account.id }, body: JSON.stringify(input) });
        const result = await response.json() as SessionSubmission & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not link the workout.");
        onSave(result, session.id);
      } finally { mutations.current--; mutationEpoch.current++; }
    } else {
      const result = createSession(input); result.session.createdAt = session.createdAt; onSave(result, session.id);
    }
  }
  async function importCsvSession(input: SessionInput) {
    if (account) {
      const response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json", "X-LoadFactor-Account": account.id }, body: JSON.stringify(input) });
      const result = await response.json() as SessionSubmission & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Session import failed.");
      onSave(result);
    } else onSave(createSession(input));
  }
  function exportData() {
    if (account) { void api("/api/account/export").then(data => downloadJson("loadfactor-account.json", data)).catch(error => setStorageError(error instanceof Error ? error.message : "Export failed.")); return; }
    const blob = new Blob([JSON.stringify({ user: { ...demoUser, weightUnit, heightUnit }, ...data, planning, wellness }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "loadfactor-" + today + ".json"; anchor.click(); URL.revokeObjectURL(url);
  }
  function navigate(id: SectionId) {
    setActive(id);
    if (window.location.pathname !== "/" + id) window.history.pushState(null, "", "/" + id);
  }
  const currentSection = sections.find(item => item.id === active) ?? sections[0];
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/overview" className="brand" onClick={event => { event.preventDefault(); navigate("overview"); }}><BrandMark/>loadfactor<span className="brand-period">.</span></Link>
      <div className="workspace-label"><span className="status-dot"/>ATHLETE WORKSPACE</div>
      <nav aria-label="Main navigation">
        {[
          { label: "Your training", ids: ["overview", "logger", "planning", "history", "wellness"] },
          { label: "Your progress", ids: ["strength", "tests"] },
          { label: "Your workspace", ids: ["coaching", "settings"] },
        ].map(group => <div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span>{group.ids.map(id => {
          const item = sections.find(item => item.id === id)!;
          return <a key={item.id} href={"/" + item.id} aria-current={active === item.id ? "page" : undefined} className={"nav-item " + (active === item.id ? "active" : "")} onClick={event => { event.preventDefault(); navigate(item.id); }}><item.icon size={18}/><span>{item.label}</span>{active === item.id && <ChevronRight size={14}/>}</a>;
        })}</div>)}
      </nav>
      <div className="sidebar-note"><span className="tiny-label">THE LONG GAME</span><TrendingUp size={25}/><h3>Small gains.<br/>Big difference.</h3><p>Show up. Track the work.<br/>Trust your progress.</p><span className="note-line"/></div>
      <div className="profile"><span className="avatar">{firebaseUser?.displayName?.split(" ").map(n => n[0]).slice(0, 2).join("") || account?.name.split(" ").map(n => n[0]).slice(0, 2).join("") || "AM"}</span><div><strong>{firebaseUser?.displayName || account?.name || demoUser.name}</strong><span>{firebaseUser?.email ?? account?.sport ?? "Field & court athlete"}</span></div>{firebaseUser ? <button className="text-button" type="button" aria-label="Sign out" onClick={() => void signOut(firebaseAuth)}>Sign out</button> : <span className="status-dot"/>}</div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div><span className="topbar-label">WORKSPACE</span><ChevronRight size={13}/><span>{currentSection.label}</span></div><span className="live-indicator"><span className="status-dot"/><span>Built for your next level</span></span></header>
      <main id={active}>
        <div className="page-heading"><div><div className="eyebrow flex items-center gap-2"><span className="small-line"/>TRAIN. MEASURE. EVOLVE.</div><h1>{active === "overview" ? <>Your work. <span>Your progress.</span></> : currentSection.label}</h1><p>{currentSection.description}</p></div>{active !== "logger" && active !== "settings" && <button className="primary-button" onClick={() => navigate("logger")}><Plus size={17}/>Log session</button>}</div>
        {offlineQueue.length > 0 && <section className="panel p-4 mb-4" aria-label="Offline sync queue"><strong>{offlineQueue.filter(item => item.state === "pending").length} session(s) waiting to sync</strong>{offlineQueue.filter(item => item.state === "conflict" && item.serverRecord).map(item => <div className="template-item" key={item.clientId}><span>Conflict: “{item.session.title}” shares an ID with a server workout.</span><button className="text-button" type="button" onClick={() => void resolveOfflineConflict(item, "server")}>Keep server version</button><button className="text-button" type="button" onClick={() => void resolveOfflineConflict(item, "local")}>Replace with offline version</button></div>)}</section>}
        {storageError && <p className="error-message" role="alert">{storageError}</p>}
        {active === "overview" && <>
        {!account && !firebaseUser && <div className="demo-notice"><span className="demo-badge">BROWSER WORKSPACE</span><p>Workouts you add are saved in this browser.</p><button type="button" className="text-button" onClick={() => navigate("settings")}>Account options</button></div>}
        <section className="quick-actions" aria-label="Start here">
          {[
            { id: "logger" as const, icon: Dumbbell, title: "Record a workout", text: "Add your exercises and sets.", action: "Start logging" },
            { id: "planning" as const, icon: Activity, title: "Plan your week", text: "Schedule workouts and set a goal.", action: "Open schedule" },
            { id: "wellness" as const, icon: Gauge, title: "How are you feeling?", text: "Check in on sleep, energy and recovery.", action: "Daily check-in" },
          ].map(item => <button type="button" className="quick-action" key={item.id} onClick={() => navigate(item.id)}><span className="quick-action-icon"><item.icon size={22}/></span><strong>{item.title}</strong><span>{item.text}</span><span className="quick-action-link">{item.action}<ChevronRight size={16}/></span></button>)}
        </section>
        <div className="overview-toolbar"><div className="flex items-center gap-2"><span className="status-dot"/><span>Performance snapshot</span><span className="demo-badge">{account ? "ACCOUNT DATA" : firebaseUser ? "BROWSER DATA" : "BROWSER DATA"}</span></div><span>{parseDate(today).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span></div>
        {data.sessions.length === 0 ? <section className="panel empty-workspace"><span className="icon-box"><Dumbbell size={24}/></span><h2>No workouts yet</h2><p>Your metrics and charts will appear after you record or import your first workout.</p><div className="flex flex-wrap gap-3"><button type="button" className="primary-button" onClick={() => navigate("logger")}>Record your first workout</button><button type="button" className="secondary-button" onClick={() => navigate("history")}>Import workouts</button></div></section> : <>
        <div className="metric-grid">
          <Metric title="Vertical jump PR" icon={<MoveUpRight size={19}/>} value={summary.verticalPr === null ? "—" : heightFromCm(summary.verticalPr, heightUnit).toFixed(1)} unit={heightUnit} foot="All-time personal best" color="lime" badge={<><ArrowUpRight size={13}/>Explosive power</>}/>
          <Metric title="10m fly sprint" icon={<Timer size={19}/>} value={summary.sprintPr?.toFixed(2) ?? "—"} unit="sec" foot="Fastest recorded split" color="blue" badge={<><ArrowDownRight size={13}/>Speed benchmark</>}/>
          <Metric title="Weekly volume" icon={<Dumbbell size={19}/>} value={number(weightFromKg(summary.weeklyVolume, weightUnit))} unit={weightUnit} foot={summary.weeklySessions + " sessions this week"} color="purple" badge={<><TrendingUp size={13}/>Weight × reps</>}/>
          <Metric title="Mean set RPE" icon={<Gauge size={19}/>} value={summary.averageRpe?.toFixed(1) ?? "—"} unit="/ 10" foot="Mean set RPE · this week" color="orange" badge={<><Flame size={13}/>Perceived exertion</>}/>
        </div>
        <div className="progress-heading"><div><h2>Performance trends</h2><p>See the bigger picture behind every rep.</p></div><div className="range-switch" role="group" aria-label="Chart time range">{[14, 30, 60].map(days => <button key={days} aria-pressed={range === days} className={range === days ? "selected" : ""} onClick={() => setRange(days)}>{days} days</button>)}</div></div>
        <PerformanceCharts jumps={charts.jumps} volume={charts.volume} heightUnit={heightUnit} weightUnit={weightUnit}/>
        <div className="momentum-banner"><span className="momentum-icon"><Zap size={22}/></span><div><strong>The work adds up.</strong><p>You’ve logged {summary.weeklySessions} sessions this week. Keep building your baseline.</p></div><span className="momentum-tag"><span className="status-dot"/>STAY CONSISTENT</span></div>
        </>}
        </>}
        {active === "tests" && <TestAnalysis sessions={data.sessions} heightUnit={heightUnit}/>}
        {active === "wellness" && <WellnessDashboard checkIns={wellness} onCheckIns={updateWellness} sessions={data.sessions} today={today} accountId={account?.id} weightUnit={weightUnit} heightUnit={heightUnit}/>}
        {active === "planning" && <TrainingPlanner planning={planning} onPlanning={updatePlanning} sessions={data.sessions} today={today} accountId={account?.id} timezone={account?.timezone} templates={initialWorkspace?.templates ?? []} weightUnit={weightUnit} onStart={startPlanned} onLink={linkPlanned}/>}
        {active === "strength" && <StrengthDashboard sessions={data.sessions} custom={initialWorkspace?.custom ?? []} today={today} weightUnit={weightUnit} accountId={account?.id} settings={strengthSettings} onSettings={setStrengthSettings}/>}
        {active === "coaching" && <CoachingPanel account={account} today={today} weightUnit={weightUnit} heightUnit={heightUnit} planning={planning}/>}
        {active === "settings" && <>
        {firebaseUser ? <section className="panel account-panel"><h2>Firebase account</h2><p className="account-description">Signed in as {firebaseUser.email}. Your LoadFactor workouts are currently saved in this browser. Cloud account sync is not connected yet.</p><button className="secondary-button" type="button" onClick={() => void signOut(firebaseAuth)}>Sign out</button></section> : <AccountPanel account={account}/>}
        <section className="panel preferences"><div><h2>Make it your own</h2><p>{account ? "Preview units below. Save permanent preferences in Account & data." : "Your preferred units, across every chart and metric."}</p></div><div className="flex flex-wrap gap-3"><label className="field-label">Weight<select value={weightUnit} onChange={e => setWeightUnit(e.target.value as WeightUnit)}><option value="kg">Kilograms (kg)</option><option value="lbs">Pounds (lbs)</option></select></label><label className="field-label">Jump height<select value={heightUnit} onChange={e => setHeightUnit(e.target.value as HeightUnit)}><option value="in">Inches (in)</option><option value="cm">Centimeters (cm)</option></select></label></div></section>
        </>}
        {active === "logger" && completedWorkout && <><p className="success-message" role="status">Workout saved. Your results are ready.</p><WorkoutResults session={completedWorkout} weightUnit={weightUnit} heightUnit={heightUnit}/><div className="results-actions"><button type="button" className="primary-button" onClick={() => setCompletedWorkout(null)}>Log another workout</button><button type="button" className="secondary-button" onClick={() => navigate("history")}>Training history</button><button type="button" className="secondary-button" onClick={() => navigate("overview")}>Weekly progress</button></div></>}
        {active === "logger" && !completedWorkout && <SessionLogger defaultBodyweightKg={account?.bodyweightKg ?? null} strengthSettings={strengthSettings} key={account?.id ?? firebaseUser?.uid ?? "browser"} browserUserId={firebaseUser?.uid} accountId={account?.id} initialAssets={initialWorkspace ? { custom: initialWorkspace.custom, templates: initialWorkspace.templates } : undefined} today={today} weightUnit={weightUnit} heightUnit={heightUnit} onSave={(result, editId) => { onSave(result, editId); setCompletedWorkout(result.session); window.requestAnimationFrame(() => document.getElementById("workout-results-heading")?.scrollIntoView({ block: "start" })); }} sessions={data.sessions} request={request} onRequestHandled={() => setRequest(null)}/>}
        {active === "history" && <>
        <TrainingHistory sessions={data.sessions} today={today} weightUnit={weightUnit} heightUnit={heightUnit} accountId={account?.id} initialFilters={initialWorkspace?.savedFilters ?? []} ready={ready} deleted={!!deleted} onUndo={() => void undoDelete()} onEdit={openSession} onDelete={id => void removeSession(id)} onExport={exportData}/>
        <SessionCsvTools sessions={data.sessions} today={today} onImport={importCsvSession}/>
        </>}
        <footer><a href="#" className="footer-brand">loadfactor.</a><p>{ready ? (account ? "Account workspace - Sessions saved on the server" : "Browser workspace · Sessions saved in this browser") : "Loading your workspace…"}<span>Built for the athletes who put in the work.</span></p></footer>
      </main>
    </div>
  </div>;
}
function Metric({ title, icon, value, unit, foot, color, badge }: { title: string; icon: React.ReactNode; value: string; unit: string; foot: string; color: string; badge: React.ReactNode }) {
  return <section className={"metric-card " + color}><div className="metric-label"><span>{title}</span><span className="metric-icon">{icon}</span></div><p className="metric-value">{value}<span>{unit}</span></p><p className="metric-foot">{foot}</p><div className="metric-badge">{badge}</div><span className="metric-decoration"/></section>;
}
