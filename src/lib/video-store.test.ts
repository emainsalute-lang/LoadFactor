import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { deleteVideoReport, listVideoReports, readVideoReport, saveVideoReport } from "./video-store";
import type { VideoReport } from "./video-analysis";
const report:VideoReport={id:"c392aa96-30e4-4ae4-81c0-cd3dc4111bb4",userId:"athlete-a",title:"Movement review",sport:"Running",exercise:"Running drill",movement:"movement",date:"2026-10-05",duration:10,sessionId:null,notes:"",samples:[],confirmedReps:null,sprint:null,courseMarkers:null,timingSource:"manual",readiness:null,reviewed:false,cloudUploaded:false,linkedTestId:null,model:"MediaPipe Pose Landmarker lite / video-v1",createdAt:"2026-10-05T12:00:00.000Z",updatedAt:"2026-10-05T12:00:00.000Z"};
beforeEach(()=>vi.stubGlobal("indexedDB",new IDBFactory()));afterEach(()=>vi.unstubAllGlobals());
describe("private browser athlete video archive",()=>{
  it("preserves video blobs and separates account libraries even with identical report IDs",async()=>{
    const video=new Blob(["private clip"],{type:"video/mp4"});
    await saveVideoReport("athlete-a",report,video);
    expect(await readVideoReport("athlete-b",report.id)).toBeNull();
    expect(await listVideoReports("athlete-b")).toEqual([]);
    expect(await (await readVideoReport("athlete-a",report.id))?.video.text()).toBe("private clip");
    await saveVideoReport("athlete-b",{...report,userId:"athlete-b",title:"B's clip"},new Blob(["B"]));
    await deleteVideoReport("athlete-a",report.id);
    expect(await listVideoReports("athlete-a")).toEqual([]);
    expect((await listVideoReports("athlete-b"))[0].title).toBe("B's clip");
  });
  it("rejects writes under a different owner and invalid report measurements",async()=>{
    await expect(saveVideoReport("athlete-b",report,new Blob(["clip"]))).rejects.toThrow();
    await expect(saveVideoReport("athlete-a",{...report,duration:-1},new Blob(["clip"]))).rejects.toThrow();
    expect(await listVideoReports("athlete-a")).toEqual([]);
  });
});
