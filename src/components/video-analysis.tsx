"use client";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { Camera, Upload, Play, Square, Download, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { deleteObject, ref, uploadBytesResumable } from "firebase/storage";
import { firebaseAuth, firebaseStorage } from "@/lib/firebase/client";
import { useFirebaseUser } from "./firebase-auth";
import type { AthleteData } from "./athlete-data";
import { readiness } from "@/lib/athlete-performance";
import { analyzeVideo } from "@/lib/video-engine";
import { deleteVideoReport, listVideoReports, readVideoReport, saveVideoReport } from "@/lib/video-store";
import { reportPerformanceTest, sprintResult, suggestSprintCrossings, summarizeVideo, validateVideoFile, videoReportSchema, VIDEO_LIMIT_SECONDS, type Movement, type VideoReport, type VideoSample } from "@/lib/video-analysis";
import type { WorkoutSession } from "@/lib/types";

const movementNames:Record<Movement,string>={squat:"Squat repetitions", "push-up":"Push-up repetitions", sprint:"Sprint timing", movement:"Other exercise / lower-body review", "upper-body":"Other exercise / upper-body review"};
const bones=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];

export default function VideoAnalysisPage({data,sessions,today}:{data:AthleteData;sessions:WorkoutSession[];today:string}) {
  const user=useFirebaseUser();
  const [source,setSource]=useState<{blob:Blob;url:string}|null>(null), [duration,setDuration]=useState(0);
  const [title,setTitle]=useState(""), [sport,setSport]=useState(""), [exercise,setExercise]=useState(""), [date,setDate]=useState(today), [sessionId,setSessionId]=useState("");
  const [movement,setMovement]=useState<Movement>("squat"), [notes,setNotes]=useState("");
  const [samples,setSamples]=useState<VideoSample[]>([]), [reps,setReps]=useState(""), [distance,setDistance]=useState("10"), [start,setStart]=useState(""), [finish,setFinish]=useState("");
  const [reviewed,setReviewed]=useState(false), [savedReport,setSavedReport]=useState<VideoReport|null>(null);
  const [startMarker,setStartMarker]=useState(""),[finishMarker,setFinishMarker]=useState(""),[markTarget,setMarkTarget]=useState<"start"|"finish"|null>(null);
  const [timingSource,setTimingSource]=useState<"manual"|"ai-suggested">("manual");
  const [reports,setReports]=useState<VideoReport[]>([]), [libraryReady,setLibraryReady]=useState(false);
  const [busy,setBusy]=useState(false), [progress,setProgress]=useState(0), [analysisRunning,setAnalysisRunning]=useState(false);
  const [camera,setCamera]=useState(false), [recording,setRecording]=useState(false);
  const [error,setError]=useState(""), [notice,setNotice]=useState("");
  const [currentTime,setCurrentTime]=useState(0);
  const video=useRef<HTMLVideoElement>(null), cameraVideo=useRef<HTMLVideoElement>(null);
  const recorder=useRef<MediaRecorder|null>(null), stream=useRef<MediaStream|null>(null), recordingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const analysis=useRef<AbortController|null>(null), objectUrl=useRef<string|null>(null), alive=useRef(true), fileInput=useRef<HTMLInputElement>(null), cloudTask=useRef<ReturnType<typeof uploadBytesResumable>|null>(null);
  const summary=summarizeVideo(samples,movement);
  const dayCheckIn=data.checkIns.find(c=>c.date===date) ?? (savedReport?.readiness?.date===date?savedReport.readiness:undefined), recovery=dayCheckIn ? readiness(dayCheckIn) : null;
  const sprint=movement==="sprint" && start!=="" && finish!=="" && Number(finish)>Number(start) && Number(distance)>0 && Number(finish)<=duration && Number(finish)-Number(start)>=0.1 ? sprintResult({distanceM:Number(distance),start:Number(start),end:Number(finish)}) : null;
  const effectiveSport=sport || data.profile?.sport || "Other";

  function selectVideo(blob:Blob) {
    validateVideoFile(blob);
    if(objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url=URL.createObjectURL(blob);objectUrl.current=url;
    setSource({blob,url});setDuration(0);setSamples([]);setReps("");setStart("");setFinish("");setTimingSource("manual");setStartMarker("");setFinishMarker("");setMarkTarget(null);setReviewed(false);setSavedReport(null);setCurrentTime(0);setError("");setNotice("");
  }
  async function refreshLibrary() {if(user) {setReports(await listVideoReports(user.uid));setLibraryReady(true);}}
  async function openReport(id:string) {
    if(!user || busy || recording) return;
    try {
      const item=await readVideoReport(user.uid,id);if(!alive.current)return;if(!item) throw new Error("This report is no longer available.");
      selectVideo(item.video);const r=item.report;
      setTitle(r.title);setSport(r.sport);setExercise(r.exercise);setDate(r.date);setSessionId(r.sessionId??"");setMovement(r.movement);setNotes(r.notes);setSamples(r.samples);
      setReps(r.confirmedReps===null?"":String(r.confirmedReps));setDistance(r.sprint?String(r.sprint.distanceM):"10");setStart(r.sprint?String(r.sprint.start):"");setFinish(r.sprint?String(r.sprint.end):"");setReviewed(r.reviewed);setSavedReport(r);
      setTimingSource(r.timingSource);setStartMarker(r.courseMarkers?String(r.courseMarkers.startX*100):"");setFinishMarker(r.courseMarkers?String(r.courseMarkers.finishX*100):"");
    } catch(reason) {setError(reason instanceof Error ? reason.message : "Could not open the saved video.");}
  }
  useEffect(()=>{
    alive.current=true;
    if(user) listVideoReports(user.uid).then(values=>{if(alive.current){setReports(values);setLibraryReady(true);}}).catch(()=>{if(alive.current)setError("Saved video reports could not be read. Check browser storage access.");});
    return ()=>{alive.current=false;analysis.current?.abort();cloudTask.current?.cancel();if(recordingTimer.current)clearTimeout(recordingTimer.current);if(recorder.current?.state==="recording")recorder.current.stop();stream.current?.getTracks().forEach(track=>track.stop());if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);};
  },[user]);
  // Deep links from history, overview and workout details select an existing private report.
  const requested=useRef(false);
  useEffect(()=>{const frame=requestAnimationFrame(()=>{if(libraryReady && !requested.current){requested.current=true;const id=new URLSearchParams(window.location.search).get("report");if(id) void openReport(id);}});return()=>cancelAnimationFrame(frame);},[libraryReady]); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseFile(event:ChangeEvent<HTMLInputElement>) {const file=event.target.files?.[0];if(file)try{selectVideo(file);}catch(reason){setError(reason instanceof Error?reason.message:"Could not open this video.");}event.target.value="";}
  async function startCamera() {
    if(busy||camera)return;setBusy(true);setError("");
    try {
      if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==="undefined") throw new Error("Camera recording is unavailable here. Upload a video instead, or use an HTTPS browser with camera support.");
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:1280},height:{ideal:720}},audio:false});
      if(!alive.current){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;if(cameraVideo.current)cameraVideo.current.srcObject=media;setCamera(true);
    } catch(reason){if(alive.current)setError(reason instanceof Error?reason.message:"Camera access was not granted. You can still upload a video.");}finally{if(alive.current)setBusy(false);}
  }
  function closeCamera(){if(recorder.current?.state==="recording")recorder.current.stop();stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;setCamera(false);}
  function startRecording() {
    try {
      if(!stream.current) return;
      const mime=["video/mp4","video/webm;codecs=vp8","video/webm"].find(type=>MediaRecorder.isTypeSupported(type));
      const next=new MediaRecorder(stream.current,mime?{mimeType:mime}:undefined), chunks:BlobPart[]=[];let bytes=0;
      next.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);bytes+=event.data.size;if(bytes>=100*1024*1024 && next.state==="recording")next.stop();}};
      next.onstop=()=>{if(recordingTimer.current)clearTimeout(recordingTimer.current);stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(!alive.current)return;setRecording(false);setCamera(false);try{selectVideo(new Blob(chunks,{type:next.mimeType.split(";")[0]}));setNotice("Recording ready. Replay it, then analyze the movement.");}catch(reason){setError(reason instanceof Error?reason.message:"Could not read the recording.");}};
      next.onerror=()=>{if(alive.current)setError("Recording failed. Upload a video or try again.");closeCamera();};
      recorder.current=next;next.start(1000);setRecording(true);recordingTimer.current=setTimeout(()=>{if(next.state==="recording")next.stop();},VIDEO_LIMIT_SECONDS*1000);
    } catch{setError("This browser could not start recording. Upload a video instead.");closeCamera();}
  }
  function metadata(element:HTMLVideoElement) {
    if(!Number.isFinite(element.duration)) {
      element.addEventListener("durationchange",()=>{if(Number.isFinite(element.duration)){element.currentTime=0;metadata(element);}},{once:true});
      element.currentTime=1e6;return;
    }
    if(element.duration>VIDEO_LIMIT_SECONDS||element.duration<=0){setError("Use a video up to two minutes long. Trim longer recordings first.");setDuration(0);return;}
    setDuration(element.duration);
  }
  async function runAnalysis() {
    if(!video.current || !source || busy) return;
    const controller=new AbortController();analysis.current=controller;setBusy(true);setAnalysisRunning(true);setProgress(0);setError("");setNotice("");setReviewed(false);
    try {const result=await analyzeVideo(video.current,movement,controller.signal,value=>{if(alive.current)setProgress(value);});if(alive.current){setSamples(result);const count=summarizeVideo(result,movement).estimatedReps;setReps(count===null?"":String(count));setNotice("Analysis complete. Review the estimates and replay before saving.");}}
    catch(reason){if(alive.current)setError(reason instanceof Error && reason.name==="AbortError"?"Analysis cancelled. Your video is still available.":reason instanceof Error?reason.message:"Analysis could not complete.");}
    finally{if(alive.current){setBusy(false);setAnalysisRunning(false);}analysis.current=null;}
  }
  function makeReport():VideoReport {
    if(!user || firebaseAuth.currentUser?.uid!==user.uid || !source)throw new Error("Sign in and choose a video first.");
    if(date>today)throw new Error("Choose today or a past recording date.");
    if(!title.trim())throw new Error("Name this video report before saving.");
    if(!exercise.trim())throw new Error("Enter the exercise or drill shown in the recording.");
    if(movement==="sprint"&&(start!==""||finish!=="")&&!sprint)throw new Error("Check sprint distance and crossing times. Start and finish must be inside the video, at least 0.1 seconds apart.");
    const now=new Date().toISOString();
    const parsed=videoReportSchema.safeParse({id:savedReport?.id??crypto.randomUUID(),userId:user.uid,title,sport:effectiveSport,exercise,movement,date,duration,sessionId:sessionId||null,notes,samples,
      confirmedReps:["squat","push-up"].includes(movement)&&reps!==""?Number(reps):null,
      sprint:movement==="sprint" && sprint?{distanceM:Number(distance),start:Number(start),end:Number(finish)}:null,
      courseMarkers:movement==="sprint"&&startMarker!==""&&finishMarker!==""?{startX:Number(startMarker)/100,finishX:Number(finishMarker)/100}:null,timingSource,
      readiness:dayCheckIn??savedReport?.readiness??null,reviewed,cloudUploaded:savedReport?.cloudUploaded??false,linkedTestId:savedReport?.linkedTestId??null,
      model:"MediaPipe Pose Landmarker lite / video-v1",createdAt:savedReport?.createdAt??now,updatedAt:now});
    if(!parsed.success)throw new Error(`${parsed.error.issues[0].path.join(" ")}: ${parsed.error.issues[0].message}`);
    return parsed.data;
  }
  async function saveReport() {
    if(!source || busy)return;setError("");setNotice("");setBusy(true);
    try{const report=makeReport();await saveVideoReport(report.userId,report,source.blob);setSavedReport(report);await refreshLibrary();setNotice("Video and report saved in your account's browser workspace.");}
    catch(reason){setError(reason instanceof Error?reason.message:"Could not save the report.");}finally{setBusy(false);}
  }
  async function addTest() {
    if(!source || busy)return;setBusy(true);setError("");setNotice("");
    try{const report=makeReport(), test=reportPerformanceTest(report);await data.saveTest(test);const next={...report,linkedTestId:test.id};await saveVideoReport(report.userId,next,source.blob);setSavedReport(next);await refreshLibrary();setNotice("Reviewed result added to Performance testing. Its charts and PRs use the same result.");}
    catch(reason){setError(reason instanceof Error?reason.message:"Could not add the test. Check Firebase setup.");}finally{setBusy(false);}
  }
  async function cloudUpload() {
    if(!source || busy)return;setBusy(true);setError("");setNotice("");setProgress(0);
    try{const report=makeReport();await saveVideoReport(report.userId,report,source.blob);setSavedReport(report);await refreshLibrary();const path=`athletes/${report.userId}/videos/${report.id}/source`;
      const task=uploadBytesResumable(ref(firebaseStorage,path),source.blob,{contentType:source.blob.type.split(";")[0]});cloudTask.current=task;
      await new Promise<void>((resolve,reject)=>task.on("state_changed",snapshot=>{if(alive.current)setProgress(Math.round(snapshot.bytesTransferred/snapshot.totalBytes*100));},reject,()=>resolve()));
      const next={...report,cloudUploaded:true};await saveVideoReport(report.userId,next,source.blob);if(alive.current){setSavedReport(next);await refreshLibrary();setNotice("Video uploaded privately. The report remains saved in this browser.");}
    }catch(reason){if(alive.current){const code=reason && typeof reason==="object" && "code" in reason?String(reason.code):"";if(code==="storage/canceled")setNotice("Upload cancelled. Your video and report are saved in this browser.");else setError(!code && reason instanceof Error?reason.message:"Private upload could not complete. Check Firebase Storage setup and rules. Your local video remains available.");}}finally{cloudTask.current=null;if(alive.current)setBusy(false);}
  }
  async function removeReport(report:VideoReport) {
    if(busy||!user||!window.confirm(`Delete the saved video report "${report.title}"? Its performance test, if added, is kept separately.`))return;
    setBusy(true);setError("");
    try{if(report.cloudUploaded)await deleteObject(ref(firebaseStorage,`athletes/${user.uid}/videos/${report.id}/source`)).catch(reason=>{if(reason?.code!=="storage/object-not-found")throw reason;});await deleteVideoReport(user.uid,report.id);if(savedReport?.id===report.id){setSavedReport(null);setSource(null);if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current=null;}await refreshLibrary();setNotice("Saved video and report deleted.");}
    catch{setError("Could not delete the video. Check your connection and cloud storage permissions.");}finally{setBusy(false);}
  }
  function downloadReport() {try{const report=makeReport();const text=JSON.stringify({...report,summary:summarizeVideo(report.samples,report.movement),sprintResult:report.sprint?sprintResult(report.sprint):null},null,2);const url=URL.createObjectURL(new Blob([text],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=`loadfactor-video-${report.date}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(reason){setError(reason instanceof Error?reason.message:"Complete the report first.");}}
  function updateMarker(target:"start"|"finish",value:string) {if(target==="start")setStartMarker(value);else setFinishMarker(value);setStart("");setFinish("");setTimingSource("manual");setReviewed(false);}
  function suggestTiming() {try{const crossing=suggestSprintCrossings(samples,Number(startMarker)/100,Number(finishMarker)/100);setStart(crossing.start.toFixed(3));setFinish(crossing.end.toFixed(3));setTimingSource("ai-suggested");setReviewed(false);setError("");setNotice("AI-suggested hip crossing times are ready. Replay and review both course markers before confirming.");}catch(reason){setError(reason instanceof Error?reason.message:"Could not suggest crossing times.");}}
  const overlay=samples.find(s=>Math.abs(s.time-currentTime)<=0.06);
  return <>
    {error&&<p className="error-message" role="alert">{error}</p>}{notice&&<p className="success-message" role="status">{notice}</p>}
    <section className="panel athlete-panel"><h2>Record an athlete in action</h2><p>Upload a short clip or record with your camera. Use one athlete, a fixed camera and a clear side view with the whole body visible. Up to 2 minutes / 100 MB.</p><p><strong>AI movement tracking</strong> uses Google MediaPipe Pose Landmarker to find body joints in your video. Select a recording, then choose Analyze movement to run the model on your device. Review its measurements before adding them to your performance tests.</p>
      <div className="video-actions"><input ref={fileInput} className="sr-only" type="file" accept="video/mp4,video/webm,video/quicktime" onChange={chooseFile}/><button disabled={busy||camera} className="primary-button" onClick={()=>fileInput.current?.click()}><Upload size={16}/>Choose video</button><button disabled={busy||camera} className="secondary-button" onClick={()=>void startCamera()}><Camera size={16}/>Open camera</button></div>
      <video ref={cameraVideo} className="video-camera" autoPlay playsInline muted hidden={!camera}/>{camera&&<div className="video-actions">{recording?<button className="primary-button" onClick={()=>recorder.current?.stop()}><Square size={16}/>Finish recording</button>:<button className="primary-button" onClick={startRecording}>Start recording</button>}<button className="secondary-button" onClick={closeCamera}>Close camera</button>{recording&&<span role="status">Recording. Stops automatically after two minutes.</span>}</div>}
      {!source&&<p>Your video analysis starts here. No performance values are generated before you provide a recording.</p>}
    </section>
    {source&&<>
      <section className="panel athlete-panel video-workspace"><div className="video-replay" onPointerDown={event=>{if(!markTarget||busy)return;const bounds=event.currentTarget.getBoundingClientRect(),value=Math.max(0,Math.min(100,(event.clientX-bounds.left)/bounds.width*100)).toFixed(1);updateMarker(markTarget,value);setMarkTarget(null);}}><video ref={video} src={source.url} controls={!analysisRunning} playsInline preload="auto" onLoadedMetadata={event=>metadata(event.currentTarget)} onTimeUpdate={event=>setCurrentTime(event.currentTarget.currentTime)} onError={()=>setError("This browser could not play the video. Try an MP4 recording.")}/>{overlay?.points.length===33&&<svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pose-overlay" aria-hidden="true">{bones.map(([a,b])=>overlay.points[a].visibility>=0.7&&overlay.points[b].visibility>=0.7?<line key={`${a}-${b}`} x1={overlay.points[a].x} y1={overlay.points[a].y} x2={overlay.points[b].x} y2={overlay.points[b].y} stroke="#facc15" strokeWidth="0.004"/>:null)}</svg>}{movement==="sprint"&&<svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pose-overlay" aria-hidden="true">{startMarker!==""&&<line x1={Number(startMarker)} x2={Number(startMarker)} y1={0} y2={100} stroke="#22c55e" strokeWidth={0.4} strokeDasharray="2 1"/>}{finishMarker!==""&&<line x1={Number(finishMarker)} x2={Number(finishMarker)} y1={0} y2={100} stroke="#facc15" strokeWidth={0.4} strokeDasharray="2 1"/>}</svg>}</div>
      <fieldset disabled={busy||recording}><div className="history-filters"><label className="field-label">Report title<input maxLength={100} value={title} onChange={e=>{setTitle(e.target.value);setReviewed(false);}} placeholder="e.g. Monday squat review"/></label><label className="field-label">Sport<input maxLength={80} value={effectiveSport} onChange={e=>setSport(e.target.value)}/></label><label className="field-label">Exercise / drill<input maxLength={100} value={exercise} onChange={e=>{setExercise(e.target.value);setReviewed(false);}} placeholder="e.g. Bodyweight squat"/></label><label className="field-label">Analysis type<select value={movement} onChange={e=>{setMovement(e.target.value as Movement);setSamples([]);setReps("");setReviewed(false);setSavedReport(null);}}>{Object.entries(movementNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="field-label">Recording date<input type="date" max={today} value={date} onChange={e=>{setDate(e.target.value);setReviewed(false);}}/></label><label className="field-label">Related saved workout<select value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">Standalone performance report</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.date} · {s.title}</option>)}</select></label></div></fieldset>
      <div className="video-actions"><button disabled={busy||!duration||recording} className="primary-button" onClick={()=>void runAnalysis()}><Play size={16}/>Analyze movement</button>{analysisRunning&&<button className="secondary-button" onClick={()=>analysis.current?.abort()}>Cancel analysis</button>}<span>{duration?`${duration.toFixed(1)} seconds` : "Loading video duration..."}</span></div>{busy&&<div role="status"><progress max={100} value={progress}/><span>{analysisRunning?"Analyzing movement":"Saving / uploading"} {progress>0?`${progress}%`:"..."}</span></div>}
      </section>
      <section className="panel athlete-panel"><h2>Athlete performance report</h2><p>Pose estimates describe the visible movement. They do not measure strength, diagnose technique faults or establish fatigue.</p>
        {samples.length>0?<><div className="athlete-stats"><div className="athlete-stat"><span>Joint tracking coverage</span><strong>{(summary.coverage*100).toFixed(0)}%</strong></div><div className="athlete-stat"><span>{(movement==="push-up"||movement==="upper-body")?"Elbow":"Knee"} angle range · video estimate</span><strong>{summary.minAngle===null?"Unavailable":`${summary.minAngle.toFixed(0)}–${summary.maxAngle!.toFixed(0)}°`}</strong></div>{["squat","push-up"].includes(movement)&&<div className="athlete-stat"><span>Estimated complete repetitions</span><strong>{summary.estimatedReps??"Unable to measure reliably"}</strong></div>}</div>
        {!summary.sufficient&&<p className="error-message">Joint tracking is insufficient for a reliable movement estimate. Try a clearer side view, better light and one fully visible athlete.</p>}{summary.multiplePeople&&<p>Multiple people were detected in some frames. Those frames were excluded.</p>}
        <div className="athlete-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={samples}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="time" type="number" unit="s"/><YAxis domain={[0,180]} unit="°"/><Tooltip/><Line dataKey="angle" name="Visible joint angle" stroke="#b88d00" dot={false} connectNulls={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>
        {summary.paceChange!==null?<p>Average complete-rep time changed by {summary.paceChange.toFixed(1)}% between the early and late halves of the clip. {summary.paceChange>0?"Later repetitions took longer.":"Later repetitions were faster or similar."} This can reflect pacing, pauses or movement changes; it does not confirm fatigue.</p>:<p>At least six reliably tracked full repetitions are needed to compare early and late rep pace.</p>}
        <details><summary>Measured frame values</summary><div className="table-scroll"><table className="history-table"><thead><tr><th>Video time (s)</th><th>Angle (°)</th><th>Tracking</th></tr></thead><tbody>{samples.filter((_,i)=>i%10===0).map(s=><tr key={s.time}><td><button className="text-button" disabled={busy} onClick={()=>{if(video.current)video.current.currentTime=s.time;setCurrentTime(s.time);}}>{s.time.toFixed(1)}</button></td><td>{s.angle?.toFixed(1)??"Not measured"}</td><td>{s.reason}</td></tr>)}</tbody></table></div><p>Analysis samples at 10 frames/second. Replay the full video to verify the count.</p></details></>:<p>Run pose analysis for joint-angle trends, or review sprint timing below.</p>}
        <fieldset disabled={busy||recording}>
        {movement==="sprint"&&<><h3>Course markers for AI-assisted timing</h3><p>Use a fixed side-view camera. Place markers on the visible start and finish of your physically measured course; the AI suggests when the athlete&apos;s hip midpoint crosses them. Both crossings must be visible.</p><div className="history-filters"><label className="field-label">Start marker (% of video width)<input type="number" min={0} max={100} step="0.1" value={startMarker} onChange={e=>updateMarker("start",e.target.value)}/><button type="button" className="text-button" onClick={()=>{video.current?.pause();setMarkTarget("start");}}>Place start marker on video</button></label><label className="field-label">Finish marker (% of video width)<input type="number" min={0} max={100} step="0.1" value={finishMarker} onChange={e=>updateMarker("finish",e.target.value)}/><button type="button" className="text-button" onClick={()=>{video.current?.pause();setMarkTarget("finish");}}>Place finish marker on video</button></label></div>{markTarget&&<p role="status">Tap the {markTarget} course marker on the paused video above, or enter its horizontal percentage.</p>}<button type="button" className="secondary-button" disabled={!samples.length||startMarker===""||finishMarker===""} onClick={suggestTiming}>Suggest crossing times from pose tracking</button></>}
        <div className="history-filters">
        {["squat","push-up"].includes(movement)&&<label className="field-label">Reviewed full repetition count<input type="number" min={0} max={1000} step={1} value={reps} onChange={e=>{setReps(e.target.value);setReviewed(false);}}/><span>Correct the estimate after replay. Zero reps never creates a performance record.</span></label>}
        {movement==="sprint"&&<><label className="field-label">Measured course distance (m)<input type="number" min="0.1" max={1000} step="any" value={distance} onChange={e=>{setDistance(e.target.value);setReviewed(false);}}/><span>Measure the course physically; pixel movement alone cannot establish metres.</span></label><label className="field-label">Start crossing time (seconds)<input type="number" min={0} max={duration} step="0.01" value={start} onChange={e=>{setStart(e.target.value);setTimingSource("manual");setReviewed(false);}}/><button type="button" className="text-button" onClick={()=>{setStart(video.current?.currentTime.toFixed(3)??"");setTimingSource("manual");setReviewed(false);}}>Use current video time</button></label><label className="field-label">Finish crossing time (seconds)<input type="number" min={0} max={duration} step="0.01" value={finish} onChange={e=>{setFinish(e.target.value);setTimingSource("manual");setReviewed(false);}}/><button type="button" className="text-button" onClick={()=>{setFinish(video.current?.currentTime.toFixed(3)??"");setTimingSource("manual");setReviewed(false);}}>Use current video time</button></label></>}
        </div>{sprint&&<p><strong>Reviewed video timing: {sprint.elapsed.toFixed(2)} s · Average speed: {sprint.averageMps.toFixed(2)} m/s ({sprint.averageKmh.toFixed(1)} km/h)</strong><br/>{timingSource==="ai-suggested"?"Crossing times were suggested from tracked hip movement; replay and verify both markers.":"Start/finish crossings are marked by you."} This is average speed over your measured distance, not peak speed.</p>}
        <h3>Recovery context for {date}</h3>{recovery?<p>Your self-reported readiness: {recovery.score}/100 ({recovery.status}). Energy: {dayCheckIn!.energy}/10; soreness: {dayCheckIn!.soreness}/10. These are your check-in answers, separate from video observations.</p>:<p>No readiness check-in is available for this recording date. <Link href="/recovery">Record a check-in</Link></p>}
        <label className="field-label">Observations / athlete notes<textarea rows={3} maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></label><label className="video-confirm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I replayed the recording and reviewed the count or timing before adding a performance result.</label>
        <div className="video-actions"><button className="primary-button" disabled={!duration} onClick={()=>void saveReport()}>Save video & report</button><button className="secondary-button" disabled={!reviewed||!data.loaded.tests||!duration||(movement==="movement"||movement==="upper-body")} onClick={()=>void addTest()}>Add reviewed result to performance tests</button><button className="secondary-button" disabled={!duration} onClick={()=>void cloudUpload()}><Upload size={16}/>Upload video privately</button><button className="text-button" disabled={!duration} onClick={downloadReport}><Download size={16}/>Export report</button></div></fieldset>
        <p>Videos and reports are saved for your account in this browser. Private uploads and performance-test syncing require your workspace&apos;s cloud services to be enabled. Saving a video does not add workout volume or training load. To update a previously added performance test after editing this report, add the reviewed result again.</p>
        {sessionId&&<Link href={`/sessions/${sessionId}`}>Open related workout and its results</Link>}{savedReport?.linkedTestId&&<p><Link href="/performance/testing">View the linked performance test and progress charts</Link></p>}
      </section>
    </>}
    <section className="panel athlete-panel"><h2>Saved athlete video reports</h2>{!libraryReady?<p role="status">Loading saved reports...</p>:!reports.length?<p>No saved recordings yet. Choose a video, review it and save your first report.</p>:<div className="video-library">{reports.map(r=><article key={r.id}><button className="text-button video-report-open" disabled={busy||recording} onClick={()=>void openReport(r.id)}><strong>{r.title}</strong><span>{r.date} · {r.sport} · {r.exercise}</span><span>{r.reviewed?"Reviewed":"Draft review"} · {r.cloudUploaded?"Private video uploaded":"Saved in this browser"}</span></button><button className="icon-button" disabled={busy} aria-label={`Delete ${r.title}`} onClick={()=>void removeReport(r)}><Trash2 size={16}/></button></article>)}</div>}</section>
  </>;
}
