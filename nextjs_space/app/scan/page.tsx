export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { ScannerScreen } from "@/components/scanner/scanner-screen";

export default async function ScanPage({
  searchParams,
}: {
  searchParams: { folderId?: string; pick?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ScannerScreen
      initialFolderId={searchParams?.folderId}
      initialPick={searchParams?.pick}
    />
  );
}
