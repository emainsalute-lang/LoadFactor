import Dashboard, { type DashboardSection } from "@/components/dashboard";
import { makeDemoData } from "@/lib/mock-data";
import { dateKey } from "@/lib/analytics";
import { athleteToday } from "@/lib/account-types";
import { currentUser } from "@/lib/server/http";
import { store } from "@/lib/server/store";

export async function WorkspacePage({ section }: { section: DashboardSection }) {
  const account = await currentUser();
  const today = account ? athleteToday(account.timezone) : dateKey(new Date());
  const workspace = account ? store().workspace(account.id) : null;
  return <Dashboard key={account?.id ?? "demo"} section={section} initialData={account ? { sessions: [], metrics: [] } : makeDemoData(today)} today={today} account={account} initialWorkspace={workspace}/>;
}
