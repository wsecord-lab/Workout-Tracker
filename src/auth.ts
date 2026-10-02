import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import {
  checkLoginAllowed,
  clearLoginFailures,
  clientIp,
  recordLoginFailure,
} from "@/lib/login-limit";

/** Thrown when sign-in is paused for too many failed attempts. `code` ends up in the URL, so it says nothing sensitive. */
export class TooManyLoginAttempts extends CredentialsSignin {
  code = "rate_limited";
  constructor(public retryAfterMinutes: number) {
    super();
  }
}

/** Compared against when the username doesn't exist, so a wrong username takes as long as a wrong password. */
const DUMMY_PASSWORD_HASH = "$2b$10$UKmeCly/z85cCsdInYVmd.sGdSP6hGZiIFEgw35DrLJOtUxMhoYUC";

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
      async authorize(credentials, request) {
        if (!credentials?.username || typeof credentials.username !== "string") return null;
        if (!credentials?.password || typeof credentials.password !== "string") return null;

        const username = credentials.username.trim().toLowerCase();
        const ip = clientIp(request?.headers);
        const limit = await checkLoginAllowed(username, ip);
        if (!limit.allowed) throw new TooManyLoginAttempts(limit.retryAfterMinutes);

        const user = await prisma.user.findUnique({ where: { email: username } });
        const valid = await bcrypt.compare(
          credentials.password,
          user?.passwordHash || DUMMY_PASSWORD_HASH
        );
        if (!user?.passwordHash || !valid) {
          await recordLoginFailure(username, ip);
          return null;
        }
        await clearLoginFailures(username, ip);

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
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        const u = user as {
          role?: Role;
          clientProfileId?: string | null;
          mustChangePassword?: boolean;
          sessionVersion?: number;
        };
        token.role = u.role;
        token.clientProfileId = u.clientProfileId ?? null;
        token.mustChangePassword = u.mustChangePassword ?? false;
        token.sessionVersion = u.sessionVersion ?? 0;
        return token;
      }
      // Every later request: drop the sign-in if the account was deleted or its
      // password changed since this sign-in was issued (sessionVersion bumped).
      const dbUser = await prisma.user.findUnique({
        where: { id: token.id as string },
        select: { role: true, mustChangePassword: true, sessionVersion: true },
      });
      if (!dbUser || dbUser.sessionVersion !== ((token.sessionVersion as number | undefined) ?? 0)) {
        return null;
      }
      token.role = dbUser.role;
      token.mustChangePassword = dbUser.mustChangePassword;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: Role }).role = (token as { role?: Role }).role as Role;

        let clientProfileId: string | null =
          (token.clientProfileId as string | null | undefined) ?? null;
        // Refreshed from the database in the jwt callback above.
        const mustChangePassword =
          (token as { mustChangePassword?: boolean }).mustChangePassword ?? false;

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
