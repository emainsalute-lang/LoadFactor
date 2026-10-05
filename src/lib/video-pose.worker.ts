import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { poseSample, type Movement, type PosePoint } from "./video-analysis";
let model:PoseLandmarker|null=null;
const context=self as unknown as { onmessage:((event:MessageEvent)=>void)|null; postMessage:(value:unknown)=>void };
context.onmessage=async(event:MessageEvent<{type:"init"|"frame";bitmap?:ImageBitmap;time?:number;movement?:Movement}>)=>{
  const request=event.data;
  try {
    if(request.type==="init") {
      const files=await FilesetResolver.forVisionTasks("/pose/wasm");
      model=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:"/pose/pose_landmarker_lite.task",delegate:"CPU"},runningMode:"VIDEO",numPoses:2,minPoseDetectionConfidence:0.6,minPosePresenceConfidence:0.6,minTrackingConfidence:0.6});
      context.postMessage({type:"ready"});
    } else if(request.bitmap && typeof request.time==="number" && request.movement && model) {
      const bitmap=request.bitmap;
      try {
        const result=model.detectForVideo(bitmap,request.time*1000+1);
        const poses:PosePoint[][]=result.landmarks.map(points=>points.map(p=>({x:p.x,y:p.y,visibility:p.visibility ?? 0})));
        context.postMessage({type:"sample",sample:poseSample(request.time,poses,request.movement,bitmap.width,bitmap.height)});
      } finally {bitmap.close();}
    } else throw new Error("The pose model is not ready.");
  } catch { context.postMessage({type:"error",message:"Movement analysis could not run. Try a shorter MP4 clip or another browser."}); }
};
