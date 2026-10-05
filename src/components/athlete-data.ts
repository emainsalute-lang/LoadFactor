"use client";
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import { firestore, firebaseAuth } from "@/lib/firebase/client";
import { useFirebaseUser } from "./firebase-auth";
import { athleteProfileSchema, readinessSchema, testRecordSchema, type AthleteProfile, type ReadinessCheckIn, type TestRecord } from "@/lib/athlete-performance";

export function useAthleteData() {
  const user = useFirebaseUser();
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [checkIns, setCheckIns] = useState<ReadinessCheckIn[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState({ profile: false, tests: false, readiness: false });
  useEffect(() => {
    if (!user) return;
    const fail = () => setError("Cloud data could not be loaded. Check your connection and Firebase security rules. Existing browser workouts are still available.");
    const stops = [
      onSnapshot(doc(firestore, "athletes", user.uid, "profile", "main"), snapshot => {
        const parsed = athleteProfileSchema.safeParse(snapshot.data());
        setProfile(snapshot.exists() && parsed.success ? parsed.data : null);
        if (snapshot.exists() && !parsed.success) setError("Saved profile has invalid fields. Review and save your profile again.");
        setLoaded(v => ({ ...v, profile: true }));
      }, fail),
      onSnapshot(collection(firestore, "athletes", user.uid, "tests"), snapshot => {
        const values: TestRecord[] = [];
        for (const d of snapshot.docs) { const parsed = testRecordSchema.safeParse(d.data()); if (parsed.success && parsed.data.userId === user.uid && parsed.data.id === d.id) values.push(parsed.data); else setError("A saved test is invalid and was excluded from reports."); }
        setTests(values); setLoaded(v => ({ ...v, tests: true }));
      }, fail),
      onSnapshot(collection(firestore, "athletes", user.uid, "readiness"), snapshot => {
        const values: ReadinessCheckIn[] = [];
        for (const d of snapshot.docs) { const parsed = readinessSchema.safeParse(d.data()); if (parsed.success && parsed.data.date === d.id) values.push(parsed.data); else setError("An invalid check-in was excluded from reports."); }
        setCheckIns(values); setLoaded(v => ({ ...v, readiness: true }));
      }, fail),
    ];
    return () => stops.forEach(stop => stop());
  }, [user]);
  function owner() {
    if (!user || firebaseAuth.currentUser?.uid !== user.uid) throw new Error("Sign in again before saving.");
    return user.uid;
  }
  return { profile, tests, checkIns, error, loaded,
    saveProfile: async (value: AthleteProfile) => { const uid = owner(); await setDoc(doc(firestore, "athletes", uid, "profile", "main"), { ...athleteProfileSchema.parse(value), userId: uid, updatedAt: new Date().toISOString() }); },
    saveTest: async (value: TestRecord) => { const uid = owner(); if (value.userId !== uid) throw new Error("Test owner does not match your account."); await setDoc(doc(firestore, "athletes", uid, "tests", value.id), testRecordSchema.parse(value)); },
    deleteTest: async (id: string) => { const uid = owner(); await deleteDoc(doc(firestore, "athletes", uid, "tests", id)); },
    saveCheckIn: async (value: ReadinessCheckIn) => { const uid = owner(); await setDoc(doc(firestore, "athletes", uid, "readiness", value.date), { ...readinessSchema.parse(value), userId: uid, updatedAt: new Date().toISOString() }); },
    deleteCheckIn: async (date: string) => { const uid = owner(); await deleteDoc(doc(firestore, "athletes", uid, "readiness", date)); },
  };
}
export type AthleteData = ReturnType<typeof useAthleteData>;
