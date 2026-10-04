import { savedFiltersSchema } from "@/lib/history";
import { planningSchema } from "@/lib/planning";
import { wellnessSchemaFor } from "@/lib/wellness";
import { CoachingStore } from "@/lib/server/coaching-store";
import { athleteToday } from "@/lib/account-types";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assetsSchema } from "@/lib/account-validation";
import { sessionSchemaFor, strengthSettingsSchema } from "@/lib/validation";
import { store, ServiceError } from "@/lib/server/store";
import { handle, readBody, requireUser } from "@/lib/server/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ action: string }> };
export async function GET(request: Request, context: Context) {
  return handle(request, async () => {
    const user = await requireUser(), { action } = await context.params;
    if (action === "strength") return NextResponse.json({ settings: store().strengthSettings(user.id) });
    if (action === "planning") return NextResponse.json({ planning: store().planning(user.id) });
    if (action === "wellness") return NextResponse.json({ wellness: store().wellness(user.id) });
    if (action === "filters") return NextResponse.json({ filters: store().filters(user.id) });
    if (action === "workspace") { store().backup(user.id); return NextResponse.json(store().workspace(user.id)); }
    if (action === "backups") { store().backup(user.id); return NextResponse.json({ backups: store().backups(user.id) }); }
    if (action === "export") return new NextResponse(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), user, ...store().workspace(user.id), coaching: new CoachingStore(store()).export(user.id), deletedRecords: store().deletedRecords(user.id), backups: store().backups(user.id) }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="loadfactor-account.json"' } });
    throw new ServiceError("Action not found.", 404);
  });
}
export async function PUT(request: Request, context: Context) {
  return handle(request, async () => {
    const user = await requireUser(), { action } = await context.params;
    if (action === "planning") return NextResponse.json({ planning: store().savePlanning(user.id, planningSchema.parse(await readBody(request))) });
    if (action === "wellness") return NextResponse.json({ wellness: store().saveWellness(user.id, wellnessSchemaFor(() => athleteToday(user.timezone)).parse(await readBody(request, 10_000))) });
    if (action === "strength") return NextResponse.json({ settings: store().saveStrengthSettings(user.id, strengthSettingsSchema.parse(await readBody(request, 100_000))) });
    if (action === "filters") return NextResponse.json({ filters: store().saveFilters(user.id, savedFiltersSchema.parse(await readBody(request, 100_000))) });
    if (action !== "workspace") throw new ServiceError("Action not found.", 404);
    store().saveAssets(user.id, assetsSchema.parse(await readBody(request))); return NextResponse.json({ success: true });
  });
}
export async function POST(request: Request, context: Context) {
  return handle(request, async () => {
    const user = await requireUser(), { action } = await context.params;
    if (action === "import") { const input = z.object({ records: z.array(z.object({ migrationId: z.string().min(1).max(200), input: sessionSchemaFor(() => athleteToday(user.timezone)) })).max(500) }).parse(await readBody(request)); return NextResponse.json({ imported: store().importRecords(user.id, input.records) }); }
    if (action === "backups") { store().backup(user.id, true); return NextResponse.json({ backups: store().backups(user.id) }); }
    if (action === "restore") { const input = z.object({ backupId: z.string().max(100), confirmation: z.literal("RESTORE") }).parse(await readBody(request, 10_000)); store().restore(user.id, input.backupId); return NextResponse.json(store().workspace(user.id)); }
    throw new ServiceError("Action not found.", 404);
  });
}
export async function DELETE(request: Request, context: Context) {
  return handle(request, async () => {
    const user = await requireUser(), { action } = await context.params;
    if (action !== "wellness") throw new ServiceError("Action not found.", 404);
    const input = z.object({ date: z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/) }).parse(await readBody(request, 1000));
    return NextResponse.json({ wellness: store().deleteWellness(user.id, input.date) });
  });
}
