import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export type AuthUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role?: string;
  mustChangePassword?: boolean;
};

export type RequireUserOptions = {
  /** Allow access while a temporary password must still be changed. */
  allowPasswordChange?: boolean;
};

/**
 * Require an authenticated user. Redirects to /login if not signed in.
 * Users with mustChangePassword are sent to change-password unless allowPasswordChange.
 */
export async function requireUser(options?: RequireUserOptions): Promise<AuthUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = session.user as AuthUser;
  if (!user.role) redirect("/login");
  if (user.mustChangePassword && !options?.allowPasswordChange) {
    redirect("/manage-account/change-password?required=1");
  }
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
 * Trainer may only access clients they own (client.trainerId === session.user.id).
 * Clients with no trainer assigned are not visible to any trainer.
 */
export async function assertTrainerOwnsClient(clientId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const role = (session.user as AuthUser).role;
  if (role !== "TRAINER") return;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { trainerId: true },
  });
  if (!client) redirect("/");
  if (client.trainerId !== session.user.id) redirect("/");
}

/**
 * Assert the current user is allowed to access the given client.
 * - TRAINER: allowed only if they own the client (assertTrainerOwnsClient).
 * - CLIENT: allowed only when Client.userId === session.user.id for that clientId.
 * Redirects otherwise.
 */
export async function assertClientAccess(clientId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const role = (session.user as AuthUser).role;
  if (role === "TRAINER") {
    await assertTrainerOwnsClient(clientId);
    return;
  }
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
 * For API routes: check if the current user may edit the given session (trainer owns client, or client owns session).
 * Does not redirect; returns allowed/denied so the route can return 403.
 */
export async function getSessionAccessForApi(sessionId: string): Promise<
  | { allowed: true; clientId: string }
  | { allowed: false }
> {
  const session = await auth();
  if (!session?.user?.id) return { allowed: false };
  const workoutSession = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    select: { clientId: true, client: { select: { trainerId: true, userId: true } } },
  });
  if (!workoutSession) return { allowed: false };
  const role = (session.user as AuthUser).role;
  if (role === "TRAINER") {
    if (workoutSession.client?.trainerId !== session.user.id) return { allowed: false };
    return { allowed: true, clientId: workoutSession.clientId };
  }
  if (role === "CLIENT") {
    if (workoutSession.client?.userId !== session.user.id) return { allowed: false };
    return { allowed: true, clientId: workoutSession.clientId };
  }
  return { allowed: false };
}

/**
 * For API routes: non-redirecting mirror of assertClientAccess.
 * - TRAINER: allowed when they own the client.
 * - CLIENT: allowed when Client.userId === session.user.id.
 * Returns a status so the route can respond 401/403/404 instead of redirecting.
 */
export async function getClientAccessForApi(
  clientId: string
): Promise<{ allowed: true } | { allowed: false; status: 401 | 403 | 404 }> {
  const session = await auth();
  if (!session?.user?.id) return { allowed: false, status: 401 };
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { trainerId: true, userId: true },
  });
  if (!client) return { allowed: false, status: 404 };
  const role = (session.user as AuthUser).role;
  if (role === "TRAINER") {
    if (client.trainerId !== session.user.id) {
      return { allowed: false, status: 403 };
    }
    return { allowed: true };
  }
  if (role === "CLIENT" && client.userId === session.user.id) {
    return { allowed: true };
  }
  return { allowed: false, status: 403 };
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
