import { prisma } from "./db";

export type TrainerContext = {
  id: string;
  email: string;
  name: string | null;
};

/**
 * Resolve the trainer this MCP process acts as.
 * Set WORKOUT_TRACKER_TRAINER_EMAIL or WORKOUT_TRACKER_TRAINER_ID in env / MCP config.
 */
export async function resolveTrainer(): Promise<TrainerContext> {
  const trainerId = process.env.WORKOUT_TRACKER_TRAINER_ID?.trim();
  const trainerEmail = process.env.WORKOUT_TRACKER_TRAINER_EMAIL?.trim();

  if (!trainerId && !trainerEmail) {
    throw new Error(
      "Set WORKOUT_TRACKER_TRAINER_EMAIL or WORKOUT_TRACKER_TRAINER_ID so the MCP server knows which trainer’s data to use."
    );
  }

  const user = await prisma.user.findFirst({
    where: {
      role: "TRAINER",
      ...(trainerId ? { id: trainerId } : { email: trainerEmail }),
    },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    throw new Error(
      `No TRAINER user found for ${trainerId ? `id=${trainerId}` : `email=${trainerEmail}`}.`
    );
  }

  return user;
}

export async function assertClientOwned(
  trainerId: string,
  clientId: string
): Promise<{ id: string; name: string }> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, trainerId },
    select: { id: true, name: true },
  });
  if (!client) {
    throw new Error(`Client ${clientId} not found for this trainer.`);
  }
  return client;
}
