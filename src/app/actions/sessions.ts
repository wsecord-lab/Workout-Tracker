"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function createSession(clientId: string, name?: string | null): Promise<void> {
  await prisma.workoutSession.create({
    data: {
      clientId,
      name: name != null && name.trim() !== "" ? name.trim() : undefined,
    },
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function updateSessionName(sessionId: string, clientId: string, name: string | null): Promise<void> {
  await prisma.workoutSession.update({
    where: { id: sessionId },
    data: { name: name != null && name.trim() !== "" ? name.trim() : null },
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteSession(sessionId: string, clientId: string): Promise<void> {
  await prisma.workoutSession.delete({
    where: { id: sessionId },
  });
  revalidatePath(`/clients/${clientId}`);
}
