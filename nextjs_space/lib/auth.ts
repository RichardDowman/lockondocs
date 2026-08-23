import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { MAX_FAILED_LOGINS, LOCKOUT_MINUTES } from "./validation";

/** Thrown messages surface to the client via NextAuth error handling. */
class LockedError extends Error {}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user || user.deletedAt) {
          return null;
        }

        // Suspended accounts cannot sign in until an admin lifts the suspension.
        if (user.suspendedAt) {
          throw new LockedError(
            "This account has been suspended. Please contact support.",
          );
        }

        // Temporary lockout after repeated failed attempts.
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new LockedError(
            "Account temporarily locked due to failed sign-in attempts. Please try again later.",
          );
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          const attempts = (user.failedLoginAttempts ?? 0) + 1;
          const shouldLock = attempts >= MAX_FAILED_LOGINS;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: shouldLock ? 0 : attempts,
              lockedUntil: shouldLock
                ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
                : user.lockedUntil,
            },
          }).catch(() => {});
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              action: shouldLock ? "auth.locked" : "auth.failed_login",
              detail: shouldLock
                ? `Account locked after ${MAX_FAILED_LOGINS} failed attempts`
                : `Failed sign-in attempt ${attempts}`,
            },
          }).catch(() => {});
          if (shouldLock) {
            throw new LockedError(
              "Account temporarily locked due to failed sign-in attempts. Please try again later.",
            );
          }
          return null;
        }

        // Successful login: clear failure counters.
        if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
          }).catch(() => {});
        }
        await prisma.auditLog.create({
          data: { userId: user.id, action: "auth.login", detail: "Successful sign-in" },
        }).catch(() => {});

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user && token?.id) {
        (session.user as any).id = token.id as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
