import { athleteToday } from "@/lib/account-types";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sessionSchemaFor } from "@/lib/validation";
import { createSession } from "@/lib/sessions";
import { dateKey } from "@/lib/analytics";
import { currentUser, COOKIE, handle, readBody } from "@/lib/server/http";
import { ServiceError, store } from "@/lib/server/store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(request, async () => {
    const user = await currentUser();
    if (request.headers.has("X-LoadFactor-Account") && request.headers.get("X-LoadFactor-Account") !== user?.id) throw new ServiceError("Your account changed or signed out. Sign in again before saving.", 401);
    if (!user && (await cookies()).has(COOKIE)) throw new ServiceError("Your sign-in expired. Sign in again before saving.", 401);
    const input = sessionSchemaFor(() => user ? athleteToday(user.timezone) : dateKey(new Date())).parse(await readBody(request, 100_000));
    if (!user && input.date > dateKey(new Date())) throw new ServiceError("Choose a date that is not in the future.", 422);
    return NextResponse.json(user ? store().save(user.id, input) : createSession(input), { status: 201 });
  });
}
