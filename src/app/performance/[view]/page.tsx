import { notFound } from "next/navigation";
import { WorkspacePage } from "../../workspace-page";
import { FirebaseWorkspaceGate } from "@/components/firebase-auth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function PerformancePage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (view !== "testing" && view !== "records") notFound();
  return <FirebaseWorkspaceGate><WorkspacePage section={view === "testing" ? "performance/testing" : "performance/records"}/></FirebaseWorkspaceGate>;
}
