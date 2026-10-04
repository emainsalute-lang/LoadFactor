import { notFound } from "next/navigation";
import SessionPage from "@/components/session-page";
import { currentUser } from "@/lib/server/http";
import { store, ServiceError } from "@/lib/server/store";
import { makeDemoData } from "@/lib/mock-data";
import { dateKey } from "@/lib/analytics";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function SessionDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ weight?: string; height?: string }> }) {
  const { id } = await params, account = await currentUser(), units = await searchParams;
  let session = null;
  if (account) {
    try { session = store().activeRecord(account.id, id).session; }
    catch (error) { if (error instanceof ServiceError && error.status === 404) notFound(); throw error; }
  }
  return <SessionPage id={id} initialSession={session} demoSessions={account ? null : makeDemoData(dateKey(new Date())).sessions} weightUnit={units.weight === "kg" || units.weight === "lbs" ? units.weight : account?.weightUnit ?? "kg"} heightUnit={units.height === "cm" || units.height === "in" ? units.height : account?.heightUnit ?? "in"}/>;
}
