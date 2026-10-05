"use client";
import { videoReportSchema, type VideoReport } from "./video-analysis";
type StoredVideo = { userId:string; id:string; report:VideoReport; video:Blob };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open("loadfactor-athlete-videos-v1",1);
    request.onupgradeneeded=()=>{const store=request.result.createObjectStore("videos",{keyPath:["userId","id"]});store.createIndex("owner","userId");};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error("Video storage is unavailable in this browser."));
  });
}
async function transaction<T>(mode:IDBTransactionMode, action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
  const db=await database();
  return new Promise((resolve,reject)=>{const tx=db.transaction("videos",mode);const request=action(tx.objectStore("videos"));
    tx.oncomplete=()=>{db.close();resolve(request.result);};tx.onerror=()=>{db.close();reject(new Error("Could not save video data. Browser storage may be full."));};tx.onabort=tx.onerror;
  });
}
export async function saveVideoReport(uid:string, report:VideoReport, video:Blob) {
  if (report.userId!==uid) throw new Error("The report belongs to a different account.");
  const parsed=videoReportSchema.parse(report);
  await transaction("readwrite",store=>store.put({userId:uid,id:parsed.id,report:parsed,video} satisfies StoredVideo));
}
export async function listVideoReports(uid:string):Promise<VideoReport[]> {
  const values=await transaction("readonly",store=>store.index("owner").getAll(uid)) as StoredVideo[];
  return values.flatMap(value=>{const parsed=videoReportSchema.safeParse(value.report);return parsed.success && parsed.data.userId===uid && parsed.data.id===value.id ? [parsed.data] : [];}).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
}
export async function readVideoReport(uid:string,id:string):Promise<StoredVideo|null> {
  const value=await transaction("readonly",store=>store.get([uid,id])) as StoredVideo|undefined;
  if (!value) return null;
  const report=videoReportSchema.parse(value.report);
  if (report.userId!==uid || value.userId!==uid || report.id!==id) throw new Error("This video is unavailable for your account.");
  return {...value,report};
}
export async function deleteVideoReport(uid:string,id:string) {await transaction("readwrite",store=>store.delete([uid,id]));}
