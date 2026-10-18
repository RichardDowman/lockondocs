export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { MobileFrame } from "@/components/app/mobile-frame";
import { ShareList } from "@/components/sharing/share-list";
export default async function SharesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <MobileFrame><div className="space-y-5 px-5 pt-6"><Link href="/settings" className="text-sm font-medium text-muted-foreground">Back to Settings</Link><h1 className="font-display text-2xl font-bold">Manage sharing</h1><p className="text-sm text-muted-foreground">Open a document and choose Share to create a link. Revoke access or review existing shares here.</p><ShareList /></div></MobileFrame>;
}
