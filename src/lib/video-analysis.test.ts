import { describe, expect, it } from "vitest";
import { jointAngle, poseSample, reportPerformanceTest, sprintResult, suggestSprintCrossings, summarizeVideo, validateVideoFile, videoReportSchema, type PosePoint, type VideoReport, type VideoSample } from "./video-analysis";
const points=()=>Array.from({length:33},()=>({x:0.5,y:0.5,visibility:1}));
function sample(time:number,angle:number|null):VideoSample{return{time,points:angle===null?[]:points(),angle,reason:angle===null?"no-pose":"tracked"};}
export function report(extra:Partial<VideoReport>={}):VideoReport{return{id:"c392aa96-30e4-4ae4-81c0-cd3dc4111bb4",userId:"athlete",title:"Squat review",sport:"Basketball",exercise:"Bodyweight squat",movement:"squat",date:"2026-10-05",duration:10,sessionId:null,notes:"",samples:[],confirmedReps:5,sprint:null,courseMarkers:null,timingSource:"manual",readiness:null,reviewed:true,cloudUploaded:false,linkedTestId:null,model:"MediaPipe Pose Landmarker lite / video-v1",createdAt:"2026-10-05T12:00:00.000Z",updatedAt:"2026-10-05T12:00:00.000Z",...extra};}
describe("athlete video measurements",()=>{
  it("uses image dimensions for joint angles and rejects coincident joints",()=>{
    const p=(x:number,y:number):PosePoint=>({x,y,visibility:1});
    expect(jointAngle(p(0,0),p(0.5,0),p(0.5,0.5),1920,1080)).toBeCloseTo(90);
    expect(jointAngle(p(0,0),p(0,0),p(1,1),1920,1080)).toBeNull();
    expect(jointAngle(p(0,0),p(0.5,0.5),p(1,1),1080,1920)).toBeCloseTo(180);
  });
  it("rejects missing, multiple, occluded and out-of-frame athletes",()=>{
    expect(poseSample(0,[],"squat",640,360).angle).toBeNull();
    expect(poseSample(0,[points(),points()],"squat",640,360).reason).toBe("multiple-people");
    const pose=points();pose[23].visibility=0.1;pose[24].visibility=0.1;
    expect(poseSample(0,[pose],"squat",640,360).reason).toBe("low-visibility");
    pose[23].visibility=1;pose[24].visibility=1;pose[23].x=-0.1;pose[24].x=1.1;
    expect(poseSample(0,[pose],"squat",640,360).reason).toBe("low-visibility");
  });
  it("counts only a complete extended-flexed-extended repetition",()=>{
    const angles=[170,140,120,95,85,100,130,170,170,140,120,95,85,100,130,170];
    const summary=summarizeVideo(angles.map((angle,i)=>sample(i/10,angle)),"squat");
    expect(summary.estimatedReps).toBe(2);expect(summary.coverage).toBe(1);expect(summary.paceChange).toBeNull();
    expect(summarizeVideo(Array.from({length:20},(_,i)=>sample(i/10,170)),"squat").estimatedReps).toBe(0);
    expect(summarizeVideo(angles.map((angle,i)=>sample(i/10,angle)),"movement").estimatedReps).toBeNull();
  });
  it("does not count an incomplete starting rep or bridge a tracking gap",()=>{
    const angles=[90,100,130,170,140,120,null,null,85,110,130,170,170,170,170];
    expect(summarizeVideo(angles.map((angle,i)=>sample(i/10,angle)),"push-up").estimatedReps).toBe(0);
    expect(summarizeVideo(Array.from({length:20},(_,i)=>sample(i/10,i%2?null:100)),"squat").estimatedReps).toBeNull();
  });
  it("reports later rep-duration changes only with six complete tracked cycles",()=>{
    const early=[170,140,120,95,85,100,130,170],late=[170,140,120,95,85,85,85,85,100,130,150,170];
    const angles=[...early,...early,...early,...late,...late,...late];
    const result=summarizeVideo(angles.map((a,i)=>sample(i/10,a)),"squat");
    expect(result.estimatedReps).toBe(6);expect(result.paceChange).toBeGreaterThan(50);
  });
  it("measures elbows for upper-body review without classifying repetitions",()=>{
    const pose=points();pose[11]={x:0.2,y:0.2,visibility:1};pose[13]={x:0.5,y:0.2,visibility:1};pose[15]={x:0.5,y:0.5,visibility:1};pose[12].visibility=0;
    const frame=poseSample(0,[pose],"upper-body",640,360);
    expect(frame.angle).toBeCloseTo(90);expect(summarizeVideo([frame],"upper-body").estimatedReps).toBeNull();
  });
  it("computes speed from a measured distance and reviewed elapsed time",()=>{
    expect(sprintResult({distanceM:10,start:1,end:3})).toEqual({elapsed:2,averageMps:5,averageKmh:18});
    expect(()=>sprintResult({distanceM:10,start:3,end:1})).toThrow();
    expect(()=>sprintResult({distanceM:Number.NaN,start:1,end:3})).toThrow();
  });
  it("suggests crossings in either direction and rejects ambiguous passes and gaps",()=>{
    const frames=Array.from({length:11},(_,i)=>{const p=points();p[23].x=p[24].x=i/10;return{...sample(i/10,120),points:p};});
    expect(suggestSprintCrossings(frames,0.2,0.8)).toMatchObject({start:0.2,end:0.8});
    const reverse=frames.map(f=>({...f,points:f.points.map(p=>({...p,x:1-p.x}))}));
    expect(suggestSprintCrossings(reverse,0.8,0.2).start).toBeCloseTo(0.2);
    expect(()=>suggestSprintCrossings(frames,0.2,0.21)).toThrow();
    expect(()=>suggestSprintCrossings([frames[0],{...frames[10],time:10}],0.2,0.8)).toThrow();
    expect(()=>suggestSprintCrossings(frames.slice(4),0.2,0.8)).toThrow();
  });
  it("requires review before adding performance results and excludes zero reps",()=>{
    expect(()=>reportPerformanceTest(report({reviewed:false}))).toThrow();
    expect(()=>reportPerformanceTest(report({confirmedReps:0}))).toThrow();
    expect(reportPerformanceTest(report())).toMatchObject({name:"Video squat repetitions",result:5,unit:"reps",direction:"higher",userId:"athlete"});
    expect(reportPerformanceTest(report({movement:"sprint",confirmedReps:null,sprint:{distanceM:10,start:1,end:3}}))).toMatchObject({name:"10m Sprint",result:2,unit:"seconds",direction:"lower"});
  });
  it("validates clips, sample chronology, dates and timing against the video",()=>{
    expect(()=>validateVideoFile({type:"image/jpeg",size:100})).toThrow();
    expect(()=>validateVideoFile({type:"video/mp4",size:101*1024*1024})).toThrow();
    expect(videoReportSchema.safeParse(report({duration:Number.NaN})).success).toBe(false);
    expect(videoReportSchema.safeParse(report({date:"2026-02-30"})).success).toBe(false);
    expect(videoReportSchema.safeParse(report({samples:[sample(2,100),sample(1,120)]})).success).toBe(false);
    expect(videoReportSchema.safeParse(report({movement:"sprint",confirmedReps:null,sprint:{distanceM:10,start:1,end:11}})).success).toBe(false);
  });
});
