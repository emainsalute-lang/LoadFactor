"use client";
import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(error => console.error("PWA service worker registration failed:", error));
  }, []);
  return null;
}
