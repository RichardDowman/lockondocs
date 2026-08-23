export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminConsole } from "@/components/admin/admin-console";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      isAdmin: true,
      isSuperAdmin: true,
      deletedAt: true,
      suspendedAt: true,
    },
  });

  const isAdmin = !!user && !user.deletedAt && !user.suspendedAt && (user.isAdmin || user.isSuperAdmin);
  if (!isAdmin) redirect("/home");

  return (
    <AdminConsole
      isSuperAdmin={!!user?.isSuperAdmin}
      adminEmail={user?.email ?? ""}
    />
  );
}
