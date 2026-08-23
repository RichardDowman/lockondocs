import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  const id = (session?.user as any)?.id as string | undefined;
  if (!id) return null;
  const { prisma } = await import("./db");
  const dbUser = await prisma.user
    .findUnique({
      where: { id },
      select: { isAdmin: true, isSuperAdmin: true, deletedAt: true, suspendedAt: true },
    })
    .catch(() => null);
  const active = !!dbUser && !dbUser.deletedAt && !dbUser.suspendedAt;
  return {
    id,
    name: (session?.user?.name ?? "") as string,
    email: (session?.user?.email ?? "") as string,
    isAdmin: active ? !!(dbUser?.isAdmin || dbUser?.isSuperAdmin) : false,
    isSuperAdmin: active ? !!dbUser?.isSuperAdmin : false,
  };
}
