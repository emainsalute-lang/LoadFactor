import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, readBody, requireUser } from "@/lib/server/http";
import { store } from "@/lib/server/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handle(request, async () => {
    const user = await requireUser();
    return NextResponse.json({ tokens: store().integrationTokens(user.id) });
  });
}

export async function POST(request: Request) {
  return handle(request, async () => {
    const user = await requireUser();
    const input = z.object({ name: z.string().trim().min(1).max(80), scopes: z.array(z.enum(["read", "write"])).min(1).max(2) }).parse(await readBody(request, 2_000));
    return NextResponse.json(store().createIntegrationToken(user.id, input.name, input.scopes), { status: 201 });
  });
}

export async function DELETE(request: Request) {
  return handle(request, async () => {
    const user = await requireUser();
    const input = z.object({ id: z.string().uuid() }).parse(await readBody(request, 1_000));
    store().revokeIntegrationToken(user.id, input.id);
    return NextResponse.json({ success: true });
  });
}
