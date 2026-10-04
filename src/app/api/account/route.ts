import { NextResponse } from "next/server";
import { z } from "zod";
import { profileSchema } from "@/lib/account-validation";
import { store } from "@/lib/server/store";
import { COOKIE, currentUser, handle, readBody, requireUser } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) { return handle(request, async () => NextResponse.json({ user: await currentUser() })); }
export async function PATCH(request: Request) { return handle(request, async () => { const user = await requireUser(); return NextResponse.json({ user: store().profile(user.id, profileSchema.parse(await readBody(request, 10_000))) }); }); }
export async function DELETE(request: Request) {
  return handle(request, async () => { const user = await requireUser(), input = z.object({ password: z.string().min(1).max(128), confirmation: z.literal("DELETE") }).parse(await readBody(request, 10_000)); store().deleteAccount(user.id, input.password); const response = NextResponse.json({ success: true }); response.cookies.delete(COOKIE); return response; });
}
