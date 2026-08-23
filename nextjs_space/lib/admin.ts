import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export interface AdminIdentity {
  id: string;
  email: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

/**
 * Returns the current user only if they are an active admin (or super admin),
 * otherwise null. Always resolves the role from the database so a demotion or
 * suspension takes effect immediately, regardless of a stale session token.
 */
export async function getAdminUser(): Promise<AdminIdentity | null> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      isAdmin: true,
      isSuperAdmin: true,
      deletedAt: true,
      suspendedAt: true,
    },
  });
  if (!user || user.deletedAt || user.suspendedAt) return null;
  if (!user.isAdmin && !user.isSuperAdmin) return null;
  return {
    id: user.id,
    email: user.email,
    isAdmin: !!user.isAdmin || !!user.isSuperAdmin,
    isSuperAdmin: !!user.isSuperAdmin,
  };
}

/** Returns the current user only if they are an active super admin, else null. */
export async function getSuperAdminUser(): Promise<AdminIdentity | null> {
  const admin = await getAdminUser();
  if (!admin || !admin.isSuperAdmin) return null;
  return admin;
}
