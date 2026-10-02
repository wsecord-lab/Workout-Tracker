import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

/** Who the MCP is acting as: a trainer (sees their clients) or a client (sees only themselves). */
export type Actor = {
  id: string;
  email: string;
  name: string | null;
  role: "TRAINER" | "CLIENT";
  /** The ApiKey used for this request. Null for the local stdio server. */
  apiKeyId: string | null;
};

/** Kept so older imports keep working. */
export type TrainerContext = Actor;

/** Prisma filter for the Client rows this actor may touch. */
export function clientScope(actor: Actor): Prisma.ClientWhereInput {
  return actor.role === "TRAINER" ? { trainerId: actor.id } : { userId: actor.id };
}

/** The trainer whose catalog and templates this actor may read. */
export async function trainerIdFor(actor: Actor): Promise<string | null> {
  if (actor.role === "TRAINER") return actor.id;
  const client = await prisma.client.findFirst({
    where: { userId: actor.id, trainerId: { not: null } },
    select: { trainerId: true },
  });
  return client?.trainerId ?? null;
}

export function assertTrainer(actor: Actor): void {
  if (actor.role !== "TRAINER") {
    throw new Error("This tool is only available to trainer accounts.");
  }
}

/**
 * Resolve the account the local (stdio) MCP process acts as.
 * Set WORKOUT_TRACKER_TRAINER_EMAIL or WORKOUT_TRACKER_TRAINER_ID in env / MCP config.
 * (Name kept for backwards compatibility; the account may be a trainer or a client.)
 */
export async function resolveActorFromEnv(): Promise<Actor> {
  const userId = process.env.WORKOUT_TRACKER_TRAINER_ID?.trim();
  const userEmail = process.env.WORKOUT_TRACKER_TRAINER_EMAIL?.trim().toLowerCase();

  if (!userId && !userEmail) {
    throw new Error(
      "Set WORKOUT_TRACKER_TRAINER_EMAIL or WORKOUT_TRACKER_TRAINER_ID so the MCP server knows which account’s data to use."
    );
  }

  const user = await prisma.user.findFirst({
    where: userId ? { id: userId } : { email: userEmail },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    throw new Error(`No user found for ${userId ? `id=${userId}` : `email=${userEmail}`}.`);
  }

  return { ...user, apiKeyId: null };
}

export async function assertClientOwned(
  actor: Actor,
  clientId: string
): Promise<{ id: string; name: string }> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...clientScope(actor) },
    select: { id: true, name: true },
  });
  if (!client) {
    throw new Error(`Client ${clientId} not found for this account.`);
  }
  return client;
}
