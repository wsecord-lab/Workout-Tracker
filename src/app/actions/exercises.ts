"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function createExercise(sessionId: string, name: string): Promise<void> {
  const session = await prisma.workoutSession.findUnique({ where: { id: sessionId }, include: { client: true } });
  if (!session) return;
  await prisma.exercise.create({
    data: { sessionId, name: name.trim() },
  });
  revalidatePath(`/clients/${session.clientId}`);
}
