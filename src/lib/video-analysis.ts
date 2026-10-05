import { z } from "zod";
import { planningDate } from "./planning";
import { readinessSchema, type TestRecord } from "./athlete-performance";

export const VIDEO_LIMIT_BYTES = 100 * 1024 * 1024;
export const VIDEO_LIMIT_SECONDS = 120;
export const ANALYSIS_HZ = 10;
export const movementSchema = z.enum(["squat", "push-up", "sprint", "movement", "upper-body"]);
export type Movement = z.infer<typeof movementSchema>;
export const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite(), visibility: z.number().finite().min(0).max(1) });
export type PosePoint = z.infer<typeof pointSchema>;
export const sampleSchema = z.object({ time: z.number().finite().min(0).max(VIDEO_LIMIT_SECONDS), points: z.array(pointSchema).max(33),
  angle: z.number().finite().min(0).max(180).nullable(), reason: z.enum(["tracked", "no-pose", "multiple-people", "low-visibility"]),
});
export type VideoSample = z.infer<typeof sampleSchema>;
const id = z.string().uuid();
export const videoReportSchema = z.object({ id, userId: z.string().min(1), title: z.string().trim().min(1).max(100),
  sport: z.string().trim().min(1).max(80), exercise: z.string().trim().min(1).max(100), movement: movementSchema,
  date: planningDate, duration: z.number().finite().positive().max(VIDEO_LIMIT_SECONDS),
  sessionId: z.string().max(100).nullable(), notes: z.string().trim().max(2000),
  samples: z.array(sampleSchema).max(1201),
  confirmedReps: z.number().int().min(0).max(1000).nullable(),
  sprint: z.object({ distanceM: z.number().finite().positive().max(1000), start: z.number().finite().min(0), end: z.number().finite().positive() }).nullable(),
  courseMarkers: z.object({ startX: z.number().finite().min(0).max(1), finishX: z.number().finite().min(0).max(1) }).nullable().default(null),
  timingSource: z.enum(["manual", "ai-suggested"]).default("manual"),
  readiness: readinessSchema.nullable(), reviewed: z.boolean(),
  cloudUploaded: z.boolean(), linkedTestId: z.string().max(100).nullable(),
  model: z.literal("MediaPipe Pose Landmarker lite / video-v1"), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).superRefine((v, ctx) => {
  if (v.samples.some((s,i) => s.time > v.duration || i > 0 && s.time <= v.samples[i-1].time)) ctx.addIssue({ code:"custom", message:"Video samples must be ordered and inside the clip." });
  if (v.sprint && (v.movement !== "sprint" || v.sprint.end <= v.sprint.start || v.sprint.end > v.duration || v.sprint.end-v.sprint.start < 0.1)) ctx.addIssue({ code:"custom", message:"Choose start and finish times inside the video, at least 0.1 seconds apart." });
  if (v.confirmedReps !== null && !["squat","push-up"].includes(v.movement)) ctx.addIssue({ code:"custom", message:"Rep confirmation is only supported for squats and push-ups." });
  if (v.readiness && v.readiness.date !== v.date) ctx.addIssue({ code:"custom", message:"Readiness context must be from the recording date." });
});
export type VideoReport = z.infer<typeof videoReportSchema>;
export function validateVideoFile(file: Pick<File,"size"|"type">) {
  if (!file.size || file.size > VIDEO_LIMIT_BYTES) throw new Error("Choose a video under 100 MB.");
  if (!["video/mp4","video/webm","video/quicktime"].includes(file.type.split(";")[0])) throw new Error("Choose an MP4, WebM or MOV video supported by your browser.");
}
export function jointAngle(a: PosePoint, b: PosePoint, c: PosePoint, width: number, height: number): number | null {
  const ax=(a.x-b.x)*width, ay=(a.y-b.y)*height, cx=(c.x-b.x)*width, cy=(c.y-b.y)*height;
  const denominator=Math.hypot(ax,ay)*Math.hypot(cx,cy);
  return denominator > 0 ? Math.acos(Math.max(-1,Math.min(1,(ax*cx+ay*cy)/denominator)))*180/Math.PI : null;
}
export function poseSample(time: number, poses: PosePoint[][], movement: Movement, width: number, height: number): VideoSample {
  if (poses.length !== 1) return { time, points: [], angle:null, reason:poses.length>1 ? "multiple-people" : "no-pose" };
  const points=poses[0], arms=movement==="push-up"||movement==="upper-body", left=arms ? [11,13,15] : [23,25,27], right=arms ? [12,14,16] : [24,26,28];
  const visible = (indices:number[]) => Math.min(...indices.map(i => {const p=points[i];return p&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1?p.visibility:0;}));
  const indices=visible(left)>=visible(right) ? left : right;
  if (visible(indices)<0.7) return {time,points,angle:null,reason:"low-visibility"};
  const angle=jointAngle(points[indices[0]],points[indices[1]],points[indices[2]],width,height);
  return {time,points,angle,reason:angle===null ? "low-visibility" : "tracked"};
}
export function summarizeVideo(samples: VideoSample[], movement: Movement) {
  const tracked=samples.filter(s=>s.angle!==null && s.reason==="tracked"), coverage=samples.length ? tracked.length/samples.length : 0;
  const repEnds:number[]=[], durations:number[]=[];
  let phase:"unknown"|"up"|"down"="unknown", start:number|null=null, lastTime:number|null=null, lastRep=-Infinity;
  const isRep=movement==="squat" || movement==="push-up";
  for (const sample of samples) {
    if (!isRep) break;
    if (sample.angle===null || sample.reason!=="tracked" || lastTime!==null && sample.time-lastTime>0.35) { phase="unknown"; start=null; lastTime=sample.time; continue; }
    lastTime=sample.time;
    if (sample.angle>=155) {
      if (phase==="down" && start!==null && sample.time-start>=0.4 && sample.time-lastRep>=0.5) {repEnds.push(sample.time);durations.push(sample.time-start);lastRep=sample.time;}
      start=null;
      phase="up";
    } else if (phase==="up") {
      if (sample.angle<145 && start===null) start=sample.time;
      if (sample.angle<=100) phase="down";
    }
  }
  const sufficient=coverage>=0.7 && tracked.length>=10;
  const half=Math.floor(durations.length/2), first=durations.slice(0,half), last=durations.slice(-half);
  const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
  const paceChange=durations.length>=6 && sufficient ? (mean(last)/mean(first)-1)*100 : null;
  return { coverage, sufficient, estimatedReps:isRep && sufficient ? repEnds.length : null, repEnds, durations,
    minAngle:tracked.length ? Math.min(...tracked.map(s=>s.angle!)) : null, maxAngle:tracked.length ? Math.max(...tracked.map(s=>s.angle!)) : null,
    paceChange, multiplePeople:samples.some(s=>s.reason==="multiple-people") };
}
export function sprintResult(sprint: NonNullable<VideoReport["sprint"]>) {
  const elapsed=sprint.end-sprint.start;
  if (!Number.isFinite(elapsed) || elapsed<0.1 || !Number.isFinite(sprint.distanceM) || sprint.distanceM<=0) throw new Error("Check the distance and video timestamps.");
  return {elapsed, averageMps:sprint.distanceM/elapsed, averageKmh:sprint.distanceM/elapsed*3.6};
}
export function suggestSprintCrossings(samples: VideoSample[], startX:number, finishX:number) {
  if (!Number.isFinite(startX)||!Number.isFinite(finishX)||startX<0||startX>1||finishX<0||finishX>1||Math.abs(finishX-startX)<0.05) throw new Error("Place two distinct course markers at least 5% of the video width apart.");
  const direction=Math.sign(finishX-startX);
  const crossings=(line:number)=>{
    const times:number[]=[];
    for(let i=1;i<samples.length;i++) {
      const a=samples[i-1],b=samples[i];
      if(b.time-a.time>0.35||a.reason==="multiple-people"||b.reason==="multiple-people")continue;
      const hips=(s:VideoSample)=>s.points[23]?.visibility>=0.7&&s.points[24]?.visibility>=0.7?(s.points[23].x+s.points[24].x)/2:null;
      const x=hips(a),y=hips(b);
      if(x===null||y===null||(y-x)*direction<=0|| (x-line)*direction>=0 || (y-line)*direction<0)continue;
      times.push(a.time+(line-x)/(y-x)*(b.time-a.time));
    }
    return times;
  };
  const starts=crossings(startX),finishes=crossings(finishX);
  if(starts.length!==1||finishes.length!==1||finishes[0]-starts[0]<0.1)throw new Error("Unable to identify one clear pass across both markers. Review and mark the crossing times manually.");
  return {start:starts[0],end:finishes[0]};
}
export function reportPerformanceTest(report: VideoReport): TestRecord {
  if (!report.reviewed) throw new Error("Review the video and confirm its measurements first.");
  let name:string, result:number, unit:TestRecord["unit"], direction:TestRecord["direction"];
  if (report.movement==="sprint" && report.sprint) {
    name=report.sprint.distanceM===10 ? "10m Sprint" : report.sprint.distanceM===20 ? "20m Sprint" : report.sprint.distanceM===36.576 ? "40-yard Dash" : `Video sprint (${report.sprint.distanceM}m)`;
    result=sprintResult(report.sprint).elapsed;unit="seconds";direction="lower";
  } else if (["squat","push-up"].includes(report.movement) && report.confirmedReps!==null && report.confirmedReps>0) {
    name=report.movement==="push-up" ? "Push-ups" : "Video squat repetitions";result=report.confirmedReps;unit="reps";direction="higher";
  } else throw new Error("A movement-review report has no confirmed test result to add.");
  return {id:report.id,userId:report.userId,name,result,unit,direction,date:report.date,
    protocol:`Reviewed video-v1: ${report.exercise}${report.sprint ? `; ${report.sprint.distanceM}m marked distance` : "; full repetitions"}`.slice(0,300),
    notes:`Video report: ${report.title}. Timing/count reviewed by athlete.`.slice(0,1000),createdAt:report.createdAt,updatedAt:new Date().toISOString()};
}
