"use client";

import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, updateProfile, type User } from "firebase/auth";
import ProductIntroduction from "./product-introduction";
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
  return <FirebaseUserContext.Provider key={user.uid} value={user}>{children}</FirebaseUserContext.Provider>;
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

  async function continueWithGoogle() {
    setBusy(true);
    setError("");
    try {
      await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
      router.replace("/overview");
    } catch (reason) {
      console.error("Firebase Google sign-in failed:", reason);
      const code = typeof reason === "object" && reason && "code" in reason ? String(reason.code) : "";
      const messages: Record<string, string> = {
        "auth/popup-closed-by-user": "Google sign-in was cancelled.",
        "auth/unauthorized-domain": "Google sign-in is not configured for this website. The app owner must add this website's hostname to Firebase Authentication's authorized domains.",
        "auth/configuration-not-found": "Firebase Authentication is not configured for this app. The app owner must set up Authentication and enable Google sign-in.",
        "auth/invalid-api-key": "The app's Firebase configuration is invalid. Contact the app owner.",
        "auth/cancelled-popup-request": "Another sign-in window was opened. Complete sign-in in the latest window.",
        "auth/too-many-requests": "Too many sign-in attempts. Wait a while and try again.",
        "auth/popup-blocked": "Allow pop-ups for this site, then try Google sign-in again.",
        "auth/operation-not-allowed": "Enable Google sign-in in the Firebase Console to use this option.",
        "auth/network-request-failed": "Could not connect to Firebase. Check your connection and try again.",
        "auth/account-exists-with-different-credential": "An account already exists with this email. Sign in using its original method.",
      };
      setError(messages[code] ?? (code.startsWith("auth/") ? `Could not sign in with Google (${code}). Please share this error code with the app owner.` : "Could not sign in with Google. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (user) return <main className="auth-loading" role="status">Opening your dashboard…</main>;
  function openAccount(mode: "signin" | "register") {
    setMode(mode); setError("");
    window.requestAnimationFrame(() => {
      document.getElementById("get-started")?.scrollIntoView({ block: "start", behavior: "smooth" });
      document.querySelector<HTMLInputElement>('#get-started input[name="email"]')?.focus({ preventScroll: true });
    });
  }
  return <ProductIntroduction onSignIn={() => openAccount("signin")} onCreateAccount={() => openAccount("register")}>
      <section className="panel auth-card" aria-labelledby="auth-heading">
        <span className="eyebrow">Sign in</span>
        <h2 id="auth-heading">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
        <p>{mode === "signin" ? "Sign in to continue to LoadFactor." : "Get started with your LoadFactor account."}</p>
        <div className="auth-switch" role="group" aria-label="Account access">
          <button type="button" aria-pressed={mode === "signin"} onClick={() => { setMode("signin"); setError(""); }}>Sign in</button>
          <button type="button" aria-pressed={mode === "register"} onClick={() => { setMode("register"); setError(""); }}>Create account</button>
        </div>
        <button className="google-auth-button" type="button" onClick={() => void continueWithGoogle()} disabled={busy}>
          <svg aria-hidden="true" viewBox="0 0 48 48" width="18" height="18"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.71 7.18l7.64 5.93c4.46-4.12 7.11-10.2 7.11-17.58Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.87l-7.64-5.93c-2.13 1.43-4.87 2.3-8.26 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>
          Continue with Google
        </button>
        <div className="auth-divider"><span>or continue with email</span></div>
        <form onSubmit={event => void submit(event)}>
          {mode === "register" && <label className="field-label">Name<input name="name" autoComplete="name" required maxLength={80}/></label>}
          <label className="field-label">Email<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
          <label className="field-label">Password<input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={6} maxLength={128} required/></label>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
        </form>
        <p className="auth-note">Secure sign-in powered by Firebase Authentication.</p>
      </section>
  </ProductIntroduction>;
}
