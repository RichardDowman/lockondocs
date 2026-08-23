export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { MobileFrame } from "@/components/app/mobile-frame";
import { HomeScreen } from "@/components/home/home-screen";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <MobileFrame>
      <HomeScreen userName={user.name} isAdmin={!!user.isAdmin} />
    </MobileFrame>
  );
}
