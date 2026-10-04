"use client";

import { useEffect } from "react";
import { firebaseApp } from "@/lib/firebase/client";

export default function FirebaseAnalytics() {
  useEffect(() => {
    let active = true;
    void import("firebase/analytics").then(async ({ getAnalytics, isSupported }) => {
      if (active && await isSupported()) getAnalytics(firebaseApp);
    }).catch(error => console.error("Firebase Analytics initialization failed:", error));
    return () => { active = false; };
  }, []);

  return null;
}
