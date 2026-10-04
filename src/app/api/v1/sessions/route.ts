import { NextResponse } from "next/server";
import { athleteToday } from "@/lib/account-types";
import { sessionSchemaFor } from "@/lib/validation";
import { handle, readBody } from "@/lib/server/http";
import { ServiceError, store } from "@/lib/server/store";

export const runtime = "nodejs";

function integrationUser(request: Request, scope: "read" | "write") {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer (lf_[a-f0-9]{64})$/.exec(authorization);
  if (!match) throw new ServiceError("Send an authorized integration token using Authorization: Bearer.", 401);
  return store().integrationUser(match[1], scope);
}

export async function GET(request: Request) {
  return handle(request, async () => {
    const user = integrationUser(request, "read");
    return NextResponse.json({ sessions: store().workspace(user.id).records.map(record => record.session) });
  });
}

export async function POST(request: Request) {
  return handle(request, async () => {
    const user = integrationUser(request, "write");
    const input = sessionSchemaFor(() => athleteToday(user.timezone)).parse(await readBody(request, 100_000));
    return NextResponse.json(store().save(user.id, input), { status: 201 });
  });
}
