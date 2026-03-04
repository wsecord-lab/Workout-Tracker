import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export type AuthUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role?: string;
};

/**
 * Require an authenticated user. Redirects to /login if not signed in.
 */
export async function requireUser(): Promise<AuthUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = session.user as AuthUser;
  if (!user.role) redirect("/login");
  return user;
}

/**
 * Require a trainer. Redirects to /login if not signed in, or to home if not a trainer.
 */
export async function requireTrainer(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "TRAINER") redirect("/");
  return user;
}

/**
 * Assert the current user is allowed to access the given client.
 * - TRAINER: allowed.
 * - CLIENT: allowed only when Client.userId === session.user.id for that clientId.
 * Redirects or throws otherwise.
 */
export async function assertClientAccess(clientId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const role = (session.user as AuthUser).role;
  if (role === "TRAINER") return;
  if (role === "CLIENT") {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { userId: true },
    });
    if (!client) redirect("/");
    if (client.userId === session.user.id) return;
  }
  redirect("/");
}

/**
 * Get the client profile id for the current CLIENT user, or null if not a client or not linked.
 */
export async function getClientIdForCurrentUser(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as AuthUser).role;
  if (role !== "CLIENT") return null;
  const client = await prisma.client.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  return client?.id ?? null;
}
