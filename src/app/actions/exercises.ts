"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function listExerciseCatalog(): Promise<{ id: string; name: string }[]> {
  const list = await prisma.exerciseCatalog.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return list;
}

export async function createCatalogExercise(name: string): Promise<{ id: string; name: string }> {
  const trimmed = name.trim();
  const catalog = await prisma.exerciseCatalog.upsert({
    where: { name: trimmed },
    create: { name: trimmed },
    update: {},
    select: { id: true, name: true },
  });
  return catalog;
}

export async function createExercise(
  sessionId: string,
  name: string,
  catalogExerciseId?: string | null
): Promise<void> {
  const session = await prisma.workoutSession.findUnique({ where: { id: sessionId }, include: { client: true } });
  if (!session) return;
  if (catalogExerciseId) {
    const catalog = await prisma.exerciseCatalog.findUnique({ where: { id: catalogExerciseId }, select: { name: true } });
    if (!catalog) return;
    await prisma.exercise.create({
      data: { sessionId, name: catalog.name, catalogExerciseId },
    });
  } else {
    await prisma.exercise.create({
      data: { sessionId, name: name.trim() },
    });
  }
  revalidatePath(`/clients/${session.clientId}`);
}

export async function createExerciseFromName(sessionId: string, name: string): Promise<void> {
  const catalog = await createCatalogExercise(name);
  await createExercise(sessionId, catalog.name, catalog.id);
}

export async function deleteExercise(exerciseId: string): Promise<void> {
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { session: true },
  });
  if (!exercise) return;
  await prisma.exercise.delete({ where: { id: exerciseId } });
  revalidatePath(`/clients/${exercise.session.clientId}`);
}
