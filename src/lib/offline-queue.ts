import type { SessionInput } from "./validation";
import type { SessionSubmission } from "./types";

export interface OfflineSession {
  clientId: string;
  accountId: string;
  session: SessionInput;
  state: "pending" | "conflict";
  serverRecord?: SessionSubmission;
}

const DATABASE = "loadfactor-offline";
function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("sessions")) request.result.createObjectStore("sessions", { keyPath: "clientId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline queue could not be opened."));
  });
}
export async function offlineSessions(accountId: string): Promise<OfflineSession[]> {
  const db = await openQueue();
  return new Promise((resolve, reject) => {
    const request = db.transaction("sessions", "readonly").objectStore("sessions").getAll();
    request.onsuccess = () => resolve((request.result as OfflineSession[]).filter(item => item.accountId === accountId));
    request.onerror = () => reject(request.error ?? new Error("Offline queue could not be read."));
  });
}
export async function enqueueOfflineSession(item: OfflineSession): Promise<void> {
  const db = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction("sessions", "readwrite").objectStore("sessions").put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Offline session could not be queued."));
  });
  window.dispatchEvent(new Event("loadfactor-offline-queued"));
}
export async function removeOfflineSession(clientId: string): Promise<void> {
  const db = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction("sessions", "readwrite").objectStore("sessions").delete(clientId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Synced offline session could not be removed from the queue."));
  });
}
export async function markOfflineConflict(clientId: string, serverRecord: SessionSubmission): Promise<void> {
  const db = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("sessions", "readwrite");
    const store = transaction.objectStore("sessions");
    const request = store.get(clientId);
    request.onsuccess = () => {
      if (!request.result) { transaction.abort(); return; }
      const item = request.result as OfflineSession;
      item.state = "conflict";
      item.serverRecord = serverRecord;
      store.put(item);
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(new Error("Conflicting offline session was not found in the queue."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline conflict could not be saved."));
  });
}
