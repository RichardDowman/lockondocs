export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { MobileFrame } from "@/components/app/mobile-frame";
import { FolderScreen } from "@/components/folder/folder-screen";

export default async function FolderPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <MobileFrame>
      <FolderScreen folderId={params.id} />
    </MobileFrame>
  );
}
