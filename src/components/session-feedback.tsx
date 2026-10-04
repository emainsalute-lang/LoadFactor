"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client-api";
import type { Feedback } from "@/lib/coaching";
export default function SessionFeedback({ athleteId, sessionId, role = "athlete" }: { athleteId: string; sessionId: string; role?: "athlete" | "coach" }) {
  const [comments, setComments] = useState<Feedback[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let stopped = false, reading = false;
    async function load() {
      if (reading) return; reading = true;
      try { const result = await api<{ comments: Feedback[] }>("/api/coaching/comments?athleteId=" + encodeURIComponent(athleteId) + "&sessionId=" + encodeURIComponent(sessionId)); if (!stopped) { setComments(result.comments); setError(""); } }
      catch (e) { if (!stopped) { setComments([]); setError(e instanceof Error ? e.message : "Feedback is unavailable."); } } finally { reading = false; }
    }
    void load(); const timer = window.setInterval(() => void load(), 15000); window.addEventListener("focus", load);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [athleteId, sessionId]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { const result = await api<{ comments: Feedback[] }>("/api/coaching/comments", "POST", { athleteId, sessionId, body, replyTo: replyTo || null }); setComments(result.comments); setBody(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save feedback."); } finally { setBusy(false); }
  }
  const roots = comments.filter(c => !c.replyTo);
  return <section className="set-row"><h3>Coach feedback</h3>{comments.map(c => <div className="session-notes" key={c.id}><strong>{c.authorName}</strong><span> / {new Date(c.createdAt).toLocaleString()}{c.replyTo ? " / reply" : ""}</span><p>{c.body}</p></div>)}{!comments.length && <p>No feedback yet.</p>}
    <form onSubmit={e => void submit(e)}><fieldset disabled={busy}><label className="field-label">{role === "athlete" ? "Reply to a coach comment" : "Thread"}<select required={role === "athlete"} value={replyTo} onChange={e => setReplyTo(e.target.value)}><option value="">{role === "athlete" ? "Choose a comment" : "New comment"}</option>{roots.map(c => <option key={c.id} value={c.id}>{c.authorName}: {c.body.slice(0, 80)}</option>)}</select></label><label className="field-label">{role === "athlete" ? "Your reply" : "Coach comment"}<textarea rows={3} maxLength={2000} required value={body} onChange={e => setBody(e.target.value)}/></label><button className="secondary-button" disabled={role === "athlete" && !roots.length}>Post {role === "athlete" ? "reply" : "feedback"}</button></fieldset></form>
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>;
}
