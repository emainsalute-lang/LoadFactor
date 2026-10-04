"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import SessionDetail from "./session-detail";
import { rebuildRecord } from "@/lib/workspace";
import type { HeightUnit, WeightUnit, WorkoutSession } from "@/lib/types";
export default function SessionPage({ id, initialSession, demoSessions, weightUnit, heightUnit }: { id: string; initialSession: WorkoutSession | null; demoSessions: WorkoutSession[] | null; weightUnit: WeightUnit; heightUnit: HeightUnit }) {
  const [session, setSession] = useState(initialSession), [ready, setReady] = useState(demoSessions === null), [error, setError] = useState("");
  useEffect(() => {
    if (!demoSessions) return;
    const frame = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem("loadfactor-workspace-v2");
        const state = raw ? JSON.parse(raw) : { records: JSON.parse(localStorage.getItem("loadfactor-sessions-v1") ?? "[]"), hidden: [] };
        if (!Array.isArray(state.records) || !Array.isArray(state.hidden)) throw new Error("Invalid local history");
        const saved = state.records.flatMap((entry: unknown) => { const result = rebuildRecord(entry); return result ? [result.session] : []; });
        setSession(saved.find((s: WorkoutSession) => s.id === id) ?? demoSessions.find(s => s.id === id && !state.hidden.includes(s.id)) ?? null);
      } catch { setError("Browser history could not be read. Return to your dashboard to review your saved sessions."); }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [id, demoSessions]);
  return <main className="detail-page"><Link className="secondary-button" href="/#history">Back to training history</Link><section className="panel account-panel">{!ready ? <p role="status">Loading session...</p> : session ? <SessionDetail session={session} weightUnit={weightUnit} heightUnit={heightUnit}/> : <><h1>Session unavailable</h1><p className="account-description">This session was deleted or is unavailable in this workspace.</p></>}{error && <p className="error-message" role="alert">{error}</p>}</section></main>;
}
