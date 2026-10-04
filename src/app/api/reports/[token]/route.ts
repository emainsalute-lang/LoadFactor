import { NextResponse } from "next/server";
import { CoachingStore } from "@/lib/server/coaching-store";
import { store } from "@/lib/server/store";
import { handle } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  return handle(request, async () => {
    const { token } = await context.params;
    return NextResponse.json(new CoachingStore(store()).report(token));
  });
}
