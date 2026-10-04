"use client";

import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, updateProfile, type User } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { firebaseAuth } from "@/lib/firebase/client";

const FirebaseUserContext = createContext<User | null>(null);
export function useFirebaseUser() { return useContext(FirebaseUserContext); }

export function FirebaseWorkspaceGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => onAuthStateChanged(firebaseAuth, current => {
    setUser(current);
    setReady(true);
    if (!current) router.replace("/");
  }, error => {
    console.error("Firebase Authentication state failed:", error);
    setReady(true);
    router.replace("/");
  }), [router]);
  if (!ready || !user) return <main className="auth-loading" role="status">Checking your sign-in…</main>;
  return <FirebaseUserContext.Provider value={user}>{children}</FirebaseUserContext.Provider>;
}

export default function FirebaseLanding() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => onAuthStateChanged(firebaseAuth, current => {
    setUser(current);
    if (current) router.replace("/overview");
  }, reason => {
    console.error("Firebase Authentication state failed:", reason);
    setError("Could not check your sign-in. Please reload and try again.");
  }), [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    const name = String(fields.get("name") ?? "").trim();
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        await updateProfile(credential.user, { displayName: name });
        router.replace("/overview");
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email, password);
        router.replace("/overview");
      }
    } catch (reason) {
      console.error("Firebase Authentication request failed:", reason);
      const code = typeof reason === "object" && reason && "code" in reason ? String(reason.code) : "";
      const messages: Record<string, string> = {
        "auth/email-already-in-use": "An account already uses this email. Sign in instead.",
        "auth/invalid-credential": "Email or password is incorrect.",
        "auth/invalid-email": "Enter a valid email address.",
        "auth/weak-password": "Choose a password with at least 6 characters.",
        "auth/too-many-requests": "Too many attempts. Wait a while and try again.",
        "auth/network-request-failed": "Could not connect to Firebase. Check your connection and try again.",
        "auth/operation-not-allowed": "Email and password sign-in is not enabled for this Firebase project.",
      };
      setError(messages[code] ?? "Could not complete sign-in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (user) return <main className="auth-loading" role="status">Opening your dashboard…</main>;
  return <main className="landing-shell">
    <header className="landing-header">
      <Link href="/" className="landing-brand"><span className="brand-mark">L</span>loadfactor<span className="brand-period">.</span></Link>
      <span className="landing-kicker">ATHLETIC PERFORMANCE</span>
    </header>
    <section className="landing-hero">
      <div className="landing-copy">
        <span className="eyebrow">TRAIN. MEASURE. EVOLVE.</span>
        <h1>Put your work<br/>in <span>perspective.</span></h1>
        <p>LoadFactor brings your training log, performance trends, strength progress, wellness, and coaching tools together in one workspace.</p>
        <ul className="landing-features">
          <li>Log strength, jumps, and sprints</li>
          <li>Plan training and follow your progress</li>
          <li>Work with coaches and manage your team</li>
        </ul>
      </div>
      <section className="panel auth-card" aria-labelledby="auth-heading">
        <span className="eyebrow">YOUR TRAINING WORKSPACE</span>
        <h2 id="auth-heading">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
        <p>{mode === "signin" ? "Sign in to continue to LoadFactor." : "Get started with your LoadFactor account."}</p>
        <div className="auth-switch" role="group" aria-label="Account access">
          <button type="button" aria-pressed={mode === "signin"} onClick={() => { setMode("signin"); setError(""); }}>Sign in</button>
          <button type="button" aria-pressed={mode === "register"} onClick={() => { setMode("register"); setError(""); }}>Create account</button>
        </div>
        <form onSubmit={event => void submit(event)}>
          {mode === "register" && <label className="field-label">Name<input name="name" autoComplete="name" required maxLength={80}/></label>}
          <label className="field-label">Email<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
          <label className="field-label">Password<input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={6} maxLength={128} required/></label>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
        </form>
        <p className="auth-note">Secure sign-in powered by Firebase Authentication.</p>
      </section>
    </section>
    <footer className="landing-footer"><span>loadfactor.</span><span>Training data, made useful.</span></footer>
  </main>;
}
