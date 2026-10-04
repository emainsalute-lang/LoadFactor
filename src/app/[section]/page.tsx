import { notFound } from "next/navigation";
import { WorkspacePage } from "../workspace-page";
import type { DashboardSection } from "@/components/dashboard";

const sections: DashboardSection[] = ["overview", "logger", "history", "coaching", "wellness", "planning", "tests", "strength", "settings"];
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.includes(section as DashboardSection)) notFound();
  return <WorkspacePage section={section as DashboardSection}/>;
}
