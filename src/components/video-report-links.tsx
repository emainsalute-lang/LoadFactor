"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useFirebaseUser } from "./firebase-auth";
import { listVideoReports } from "@/lib/video-store";
import type { VideoReport } from "@/lib/video-analysis";
export default function VideoReportLinks({sessionId}:{sessionId?:string}) {
  const user=useFirebaseUser(), [reports,setReports]=useState<VideoReport[]>([]), [error,setError]=useState("");
  useEffect(()=>{let active=true;if(user)listVideoReports(user.uid).then(values=>{if(active)setReports(values.filter(r=>!sessionId||r.sessionId===sessionId).slice(0,3));}).catch(()=>{if(active)setError("Saved video reports could not be read from this browser.");});return()=>{active=false;};},[user,sessionId]);
  if(sessionId&&!reports.length&&!error)return null;
  return <section className="panel athlete-panel"><h2>{sessionId?"Related athlete video reports":"Athlete video reports"}</h2>{error&&<p role="alert">{error}</p>}{reports.length?reports.map(r=><p key={r.id}><Link href={`/video-analysis?report=${r.id}`}><strong>{r.title}</strong></Link><br/>{r.date} · {r.exercise} · {r.reviewed?"Reviewed":"Review pending"}</p>):<p>Record or upload an exercise to review movement and save an athlete report.</p>}<Link href="/video-analysis">Open video analysis</Link></section>;
}
