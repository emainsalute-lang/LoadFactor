import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ServiceError, store } from "./store";
export const COOKIE = "loadfactor-auth";
export async function currentUser() { return store().authenticate((await cookies()).get(COOKIE)?.value); }
export async function requireUser() { const user = await currentUser(); if (!user) throw new ServiceError("Sign in to continue.", 401); return user; }
export async function readBody(request: Request, limit = 2_000_000): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ServiceError("Send a JSON request.", 415);
  const reader = request.body?.getReader(); if (!reader) throw new ServiceError("Request body is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new ServiceError("Request is too large.", 413); } chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new ServiceError("Invalid JSON."); }
}
export async function handle(request: Request, action: () => Promise<Response> | Response): Promise<Response> {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = request.headers.get("origin"), expected = process.env.APP_ORIGIN ?? new URL(request.url).origin;
      if ((origin && origin !== expected) || request.headers.get("sec-fetch-site") === "cross-site") throw new ServiceError("Request origin is not allowed.", 403);
    }
    const response = await action(); response.headers.set("Cache-Control", "no-store"); return response;
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input." }, { status: 422 });
    if (error instanceof ServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("LoadFactor request failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "The server could not complete this request. Your draft is still available." }, { status: 500 });
  }
}
export function signInResponse(request: Request, data: { user: { id: string }; recoveryCode?: string }) {
  const response = NextResponse.json(data);
  response.cookies.set(COOKIE, store().issueToken(data.user.id), { httpOnly: true, sameSite: "strict", secure: new URL(process.env.APP_ORIGIN ?? request.url).protocol === "https:", path: "/", maxAge: 30 * 86400 });
  return response;
}
