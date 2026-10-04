import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionSchemaFor } from "@/lib/validation";
import { athleteToday } from "@/lib/account-types";
import { currentUser, handle, readBody } from "@/lib/server/http";
import { ServiceError, store } from "@/lib/server/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handle(request, async () => {
    const user = await currentUser();
    if (!user) throw new ServiceError("Sign in to sync offline sessions.", 401);
    if (request.headers.has("X-LoadFactor-Account") && request.headers.get("X-LoadFactor-Account") !== user.id) throw new ServiceError("Your account changed. Reload before syncing.", 401);
    const input = z.object({
      clientId: z.string().uuid(),
      session: sessionSchemaFor(() => athleteToday(user.timezone)),
      resolution: z.enum(["server", "local"]).optional(),
    }).parse(await readBody(request, 120_000));
    const result = store().syncOfflineSession(user.id, input.clientId, input.session, input.resolution);
    if (result.conflict) return NextResponse.json({ conflict: true, record: result.record }, { status: 409 });
    return NextResponse.json(result.record);
  });
}
