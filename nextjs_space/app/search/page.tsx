export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { MobileFrame } from "@/components/app/mobile-frame";
import { SearchScreen } from "@/components/search/search-screen";

export default async function SearchPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <MobileFrame>
      <SearchScreen />
    </MobileFrame>
  );
}
