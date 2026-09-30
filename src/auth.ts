import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: Role;
      clientProfileId?: string | null;
      mustChangePassword?: boolean;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || typeof credentials.username !== "string") return null;
        if (!credentials?.password || typeof credentials.password !== "string") return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.username.trim().toLowerCase() },
        });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        let clientProfileId: string | null = null;
        if (user.role === "CLIENT") {
          const profile = await prisma.client.findFirst({
            where: { userId: user.id },
            select: { id: true },
          });
          clientProfileId = profile?.id ?? null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          clientProfileId,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        (token as { role?: Role }).role = (user as { role?: Role }).role;
        const u = user as {
          clientProfileId?: string | null;
          mustChangePassword?: boolean;
        };
        if (u.clientProfileId !== undefined) {
          token.clientProfileId = u.clientProfileId;
        }
        if (u.mustChangePassword !== undefined) {
          (token as { mustChangePassword?: boolean }).mustChangePassword =
            u.mustChangePassword;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: Role }).role = (token as { role?: Role }).role as Role;

        let clientProfileId: string | null =
          (token.clientProfileId as string | null | undefined) ?? null;
        let mustChangePassword =
          (token as { mustChangePassword?: boolean }).mustChangePassword ?? false;

        // Refresh flags from DB so password-change clears without requiring re-login.
        const dbUser = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { mustChangePassword: true },
        });
        if (dbUser) {
          mustChangePassword = dbUser.mustChangePassword;
        }

        if (session.user.role === "CLIENT" && !clientProfileId) {
          const profile = await prisma.client.findFirst({
            where: { userId: session.user.id },
            select: { id: true },
          });
          clientProfileId = profile?.id ?? null;
        }
        session.user.clientProfileId = clientProfileId;
        session.user.mustChangePassword = mustChangePassword;
      }
      return session;
    },
    redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
  secret:
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === "development" ? "dev-secret-at-least-32-characters-long" : undefined),
  trustHost: true,
});
