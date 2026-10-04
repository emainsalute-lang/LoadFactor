import { NextResponse } from "next/server";
import { z } from "zod";
import { store, ServiceError } from "@/lib/server/store";
import { CoachingStore } from "@/lib/server/coaching-store";
import { handle, readBody, requireUser } from "@/lib/server/http";
import { acceptInvitationSchema, assignmentSchema, coachPermissionsSchema, commentSchema, invitationSchema, reportSchema } from "@/lib/coaching";
const id = z.string().min(1).max(100);
type Context = { params: Promise<{ action: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return handle(request, async () => {
    const user = await requireUser(), { action } = await context.params, coaching = new CoachingStore(store()), query = new URL(request.url).searchParams;
    if (request.headers.has("X-LoadFactor-Account") && request.headers.get("X-LoadFactor-Account") !== user.id) throw new ServiceError("Your account changed. Reload before continuing.", 401);
    if (action === "state") return NextResponse.json(coaching.state(user.id));
    if (action === "athlete") return NextResponse.json(coaching.athleteView(user.id, id.parse(query.get("athleteId"))));
    if (action === "comments") return NextResponse.json({ comments: coaching.feedback(user.id, id.parse(query.get("athleteId")), id.parse(query.get("sessionId"))) });
    if (action === "completion") return NextResponse.json({ rows: coaching.completion(user.id, id.parse(query.get("teamId")), z.string().parse(query.get("from")), z.string().parse(query.get("to"))) });
    throw new ServiceError("Action not found.", 404);
  });
}
export async function POST(request: Request, context: Context) {
  return handle(request, async () => {
    const user = await requireUser(), { action } = await context.params, coaching = new CoachingStore(store());
    if (request.headers.has("X-LoadFactor-Account") && request.headers.get("X-LoadFactor-Account") !== user.id) throw new ServiceError("Your account changed. Reload before continuing.", 401);
    const body = await readBody(request, 20_000);
    if (action === "teams") { const input = z.object({ name: z.string().trim().min(1).max(80) }).parse(body); return NextResponse.json(coaching.createTeam(user.id, input.name)); }
    if (action === "invitations") return NextResponse.json(coaching.invite(user.id, invitationSchema.parse(body)));
    if (action === "preview-invitation") { const input = z.object({ code: acceptInvitationSchema.shape.code }).parse(body); return NextResponse.json(coaching.previewInvitation(user.id, input.code)); }
    if (action === "accept") return NextResponse.json(coaching.accept(user.id, acceptInvitationSchema.parse(body)));
    if (action === "members") { const input = z.object({ teamId: id, athleteId: id }).parse(body); coaching.member(user.id, input.teamId, input.athleteId, true); return NextResponse.json({ success: true }); }
    if (action === "templates") { const input = z.object({ teamId: id, templateId: id }).parse(body); return NextResponse.json(coaching.shareTemplate(user.id, input.teamId, input.templateId)); }
    if (action === "copy-template") { const input = z.object({ teamId: id, templateId: id }).parse(body); return NextResponse.json(coaching.copyTemplate(user.id, input.teamId, input.templateId)); }
    if (action === "assign") return NextResponse.json(coaching.assign(user.id, assignmentSchema.parse(body)));
    if (action === "comments") return NextResponse.json({ comments: coaching.comment(user.id, commentSchema.parse(body)) });
    if (action === "reports") return NextResponse.json(coaching.createReport(user.id, reportSchema.parse(body)));
    throw new ServiceError("Action not found.", 404);
  });
}
export async function PUT(request: Request, context: Context) {
  return handle(request, async () => {
    const user = await requireUser(), { action } = await context.params;
    if (action !== "permissions") throw new ServiceError("Action not found.", 404);
    if (request.headers.has("X-LoadFactor-Account") && request.headers.get("X-LoadFactor-Account") !== user.id) throw new ServiceError("Your account changed. Reload before continuing.", 401);
    const input = z.object({ coachId: id, permissions: coachPermissionsSchema }).parse(await readBody(request, 2000));
    return NextResponse.json(new CoachingStore(store()).setPermissions(user.id, input.coachId, input.permissions));
  });
}
export async function DELETE(request: Request, context: Context) {
  return handle(request, async () => {
    const user = await requireUser(), { action } = await context.params, coaching = new CoachingStore(store()), body = await readBody(request, 2000);
    if (request.headers.has("X-LoadFactor-Account") && request.headers.get("X-LoadFactor-Account") !== user.id) throw new ServiceError("Your account changed. Reload before continuing.", 401);
    if (action === "disconnect") { const input = z.object({ coachId: id }).parse(body); return NextResponse.json(coaching.disconnect(user.id, input.coachId)); }
    if (action === "members") { const input = z.object({ teamId: id, athleteId: id }).parse(body); coaching.member(user.id, input.teamId, input.athleteId, false); }
    else if (action === "templates") { const input = z.object({ teamId: id, templateId: id }).parse(body); coaching.removeTemplate(user.id, input.teamId, input.templateId); }
    else if (action === "invitations") coaching.revokeInvitation(user.id, z.object({ id }).parse(body).id);
    else if (action === "reports") coaching.revokeReport(user.id, z.object({ id }).parse(body).id);
    else if (action === "teams") coaching.deleteTeam(user.id, z.object({ id }).parse(body).id);
    else throw new ServiceError("Action not found.", 404);
    return NextResponse.json({ success: true });
  });
}
