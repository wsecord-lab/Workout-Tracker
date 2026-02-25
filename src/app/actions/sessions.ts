"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function createSession(clientId: string): Promise<void> {
  await prisma.workoutSession.create({
    data: { clientId },
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteSession(sessionId: string, clientId: string): Promise<void> {
  await prisma.workoutSession.delete({
    where: { id: sessionId },
  });
  revalidatePath(`/clients/${clientId}`);
}
