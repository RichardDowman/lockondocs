export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { MobileFrame } from "@/components/app/mobile-frame";
import { ActivityScreen } from "@/components/activity/activity-screen";

export default async function ActivityPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <MobileFrame>
      <ActivityScreen />
    </MobileFrame>
  );
}
