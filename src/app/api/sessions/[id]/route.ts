import { athleteToday } from "@/lib/account-types";
import { NextResponse } from "next/server";
import { sessionSchemaFor } from "@/lib/validation";
import { store } from "@/lib/server/store";
import { handle, readBody, requireUser } from "@/lib/server/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) { return handle(request, async () => { const user = await requireUser(), { id } = await context.params; return NextResponse.json(store().save(user.id, sessionSchemaFor(() => athleteToday(user.timezone)).parse(await readBody(request, 100_000)), id)); }); }
export async function DELETE(request: Request, context: Context) { return handle(request, async () => { const user = await requireUser(), { id } = await context.params; store().setDeleted(user.id, id, true); return NextResponse.json({ success: true }); }); }
export async function POST(request: Request, context: Context) { return handle(request, async () => { const user = await requireUser(), { id } = await context.params; return NextResponse.json(store().setDeleted(user.id, id, false)); }); }
