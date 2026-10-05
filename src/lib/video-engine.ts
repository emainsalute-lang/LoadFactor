"use client";
import { ANALYSIS_HZ, VIDEO_LIMIT_SECONDS, type Movement, type VideoSample } from "./video-analysis";
function seek(video:HTMLVideoElement,time:number,signal:AbortSignal):Promise<void> {
  if(signal.aborted) return Promise.reject(new DOMException("Analysis cancelled","AbortError"));
  if(Math.abs(video.currentTime-time)<0.00001 && video.readyState>=2) return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const timeout=window.setTimeout(()=>finish(new Error("The browser could not decode this video frame.")),10000);
    const finish=(error?:Error)=>{clearTimeout(timeout);video.removeEventListener("seeked",done);video.removeEventListener("error",failed);signal.removeEventListener("abort",aborted);if(error)reject(error);else resolve();};
    const done=()=>finish(), failed=()=>finish(new Error("This video format could not be decoded.")), aborted=()=>finish(new DOMException("Analysis cancelled","AbortError"));
    video.addEventListener("seeked",done,{once:true});video.addEventListener("error",failed,{once:true});signal.addEventListener("abort",aborted,{once:true});video.currentTime=time;
  });
}
export async function analyzeVideo(video:HTMLVideoElement,movement:Movement,signal:AbortSignal,onProgress:(value:number)=>void):Promise<VideoSample[]> {
  if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>VIDEO_LIMIT_SECONDS) throw new Error("Use a video up to two minutes long.");
  if(!video.videoWidth||!video.videoHeight) throw new Error("Wait for the video preview to load.");
  const worker=new Worker(new URL("./video-pose.worker.ts",import.meta.url),{type:"module"});
  const originalTime=video.currentTime;video.pause();
  function request(message:unknown, transfer:Transferable[]=[]):Promise<{sample?:VideoSample}> {
    return new Promise((resolve,reject)=>{
      if(signal.aborted) {reject(new DOMException("Analysis cancelled","AbortError"));return;}
      const timeout=window.setTimeout(()=>finish(new Error("Pose analysis timed out. Try a shorter video.")),60000);
      const finish=(error?:Error,result?:{sample?:VideoSample})=>{clearTimeout(timeout);worker.onmessage=null;worker.onerror=null;signal.removeEventListener("abort",abort);if(error)reject(error);else resolve(result??{});};
      const abort=()=>finish(new DOMException("Analysis cancelled","AbortError"));
      signal.addEventListener("abort",abort,{once:true});worker.onerror=()=>finish(new Error("Video analysis is unavailable in this browser."));
      worker.onmessage=(event:MessageEvent)=>event.data.type==="error" ? finish(new Error(event.data.message)) : finish(undefined,event.data);
      try { worker.postMessage(message,transfer); } catch {finish(new Error("This browser could not send the video frame for analysis."));}
    });
  }
  try {
    await request({type:"init"});
    const samples:VideoSample[]=[], count=Math.ceil(video.duration*ANALYSIS_HZ);
    for(let i=0;i<count;i++) {
      if(signal.aborted) throw new DOMException("Analysis cancelled","AbortError");
      const time=i/ANALYSIS_HZ;
      await seek(video,time,signal);
      const scale=Math.min(1,640/video.videoWidth);
      const bitmap=await createImageBitmap(video,{resizeWidth:Math.round(video.videoWidth*scale),resizeHeight:Math.max(1,Math.round(video.videoHeight*scale))});
      const result=await request({type:"frame",time,movement,bitmap},[bitmap]);
      if(!result.sample) throw new Error("The pose model returned no frame result.");
      samples.push(result.sample);onProgress(Math.round((i+1)/count*100));
    }
    return samples;
  } finally {worker.terminate();if(!signal.aborted) video.currentTime=originalTime;}
}
