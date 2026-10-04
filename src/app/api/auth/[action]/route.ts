import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { registerSchema, loginSchema, recoverySchema } from "@/lib/account-validation";
import { store, ServiceError } from "@/lib/server/store";
import { COOKIE, handle, readBody, signInResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  return handle(request, async () => {
    const { action } = await context.params;
    if (action === "register") { const input = registerSchema.parse(await readBody(request, 10_000)); store().throttle("register:" + input.email, 5); return signInResponse(request, store().register(input)); }
    if (action === "login") { const input = loginSchema.parse(await readBody(request, 10_000)); return signInResponse(request, { user: store().login(input.email, input.password) }); }
    if (action === "recover") { const input = recoverySchema.parse(await readBody(request, 10_000)); return signInResponse(request, store().recover(input.email, input.recoveryCode, input.password)); }
    if (action === "logout") { const token = (await cookies()).get(COOKIE)?.value; if (token) store().revoke(token); const response = NextResponse.json({ success: true }); response.cookies.delete(COOKIE); return response; }
    throw new ServiceError("Action not found.", 404);
  });
}
