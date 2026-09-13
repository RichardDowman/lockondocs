export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { MobileFrame } from "@/components/app/mobile-frame";
import { RemindersScreen } from "@/components/reminders/reminders-screen";

export default async function RemindersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <MobileFrame>
      <RemindersScreen />
    </MobileFrame>
  );
}
