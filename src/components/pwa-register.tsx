"use client";
import { useEffect, useState } from "react";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaRegister() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(true);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(error => console.error("PWA service worker registration failed:", error));
    const display = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    update();
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); setHelp(false); };
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", complete);
    display.addEventListener("change", update);
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", complete);
      display.removeEventListener("change", update);
    };
  }, []);
  async function install() {
    if (!prompt) { setHelp(value => !value); return; }
    setBusy(true);
    setError("");
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      setError("Could not open the install window. Use your browser's Install app or Add to Home Screen option.");
      setHelp(true);
    } finally { setPrompt(null); setBusy(false); }
  }
  if (installed) return null;
  return <aside className="install-app" aria-label="Install LoadFactor">
    <button type="button" className="primary-button" onClick={() => void install()} disabled={busy} aria-expanded={help} aria-controls="install-instructions">{busy ? "Opening installer…" : "Install LoadFactor"}</button>
    {help && <section id="install-instructions" className="install-instructions">
      <div className="install-heading"><strong>Get LoadFactor on your device</strong><button type="button" className="secondary-button" onClick={() => setHelp(false)} aria-label="Close install instructions">Close</button></div>
      <p>Open it from your home screen or desktop, with its own app window.</p>
      <p><strong>iPhone / iPad:</strong> Open this website in Safari, tap Share, then Add to Home Screen. If shown, enable Open as Web App, then tap Add.</p>
      <p><strong>Android:</strong> Open this website in Chrome. Use the browser menu → Install app or Add to Home Screen.</p>
      <p><strong>Computer:</strong> Use Chrome or Edge’s address-bar install icon or browser menu. In Safari on Mac, choose File → Add to Dock.</p>
      <p>Installation options depend on your browser. Sign-in requires internet; the offline logger can save a workout on this device.</p>
      {error && <p role="alert">{error}</p>}
    </section>}
  </aside>;
}
