"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/authz";
import { invalidateClientMetricsCache } from "@/lib/metrics";
import { sanitizeName, EXERCISE_NAME_MAX_LENGTH } from "@/lib/sanitize";

export async function listExerciseCatalog(): Promise<{ id: string; name: string }[]> {
  const list = await prisma.exerciseCatalog.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return list;
}

/** Sanitized: HTML stripped, max length enforced. Rejects empty name. */
export async function createCatalogExercise(name: string): Promise<{ id: string; name: string }> {
  const sanitized = sanitizeName(name, EXERCISE_NAME_MAX_LENGTH);
  if (!sanitized) throw new Error("Exercise name is required");
  const catalog = await prisma.exerciseCatalog.upsert({
    where: { name: sanitized },
    create: { name: sanitized },
    update: {},
    select: { id: true, name: true },
  });
  return catalog;
}

export async function createExercise(
  sessionId: string,
  name: string,
  catalogExerciseId?: string | null
): Promise<string | null> {
  const session = await prisma.workoutSession.findUnique({ where: { id: sessionId }, include: { client: true } });
  if (!session) return null;
  await assertClientAccess(session.clientId);
  if (catalogExerciseId) {
    const catalog = await prisma.exerciseCatalog.findUnique({ where: { id: catalogExerciseId }, select: { name: true } });
    if (!catalog) return null;
    const exercise = await prisma.exercise.create({
      data: { sessionId, name: catalog.name, catalogExerciseId },
      select: { id: true },
    });
    await invalidateClientMetricsCache(session.clientId);
    revalidatePath(`/clients/${session.clientId}`);
    return exercise.id;
  }
  const sanitizedName = sanitizeName(name, EXERCISE_NAME_MAX_LENGTH);
  if (!sanitizedName) return null;
  const exercise = await prisma.exercise.create({
    data: { sessionId, name: sanitizedName },
    select: { id: true },
  });
  await invalidateClientMetricsCache(session.clientId);
  revalidatePath(`/clients/${session.clientId}`);
  return exercise.id;
}

export async function createExerciseFromName(sessionId: string, name: string): Promise<string | null> {
  const catalog = await createCatalogExercise(name);
  return createExercise(sessionId, catalog.name, catalog.id);
}

/** Soft-delete: marks exercise as deleted so it disappears from lists; can be restored via restoreExercise within grace period. */
export async function deleteExercise(exerciseId: string): Promise<{ clientId: string } | null> {
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { session: true },
  });
  if (!exercise || exercise.deletedAt) return null;
  await assertClientAccess(exercise.session.clientId);
  await prisma.exercise.update({
    where: { id: exerciseId },
    data: { deletedAt: new Date() },
  });
  await invalidateClientMetricsCache(exercise.session.clientId);
  revalidatePath(`/clients/${exercise.session.clientId}`);
  return { clientId: exercise.session.clientId };
}

/** Restore a soft-deleted exercise (undo within grace period). */
export async function restoreExercise(exerciseId: string): Promise<{ clientId: string } | null> {
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { session: true },
  });
  if (!exercise) return null;
  await assertClientAccess(exercise.session.clientId);
  await prisma.exercise.update({
    where: { id: exerciseId },
    data: { deletedAt: null },
  });
  await invalidateClientMetricsCache(exercise.session.clientId);
  revalidatePath(`/clients/${exercise.session.clientId}`);
  return { clientId: exercise.session.clientId };
}

/** Permanently delete a soft-deleted exercise (after grace period or cleanup). */
export async function hardDeleteExercise(exerciseId: string): Promise<void> {
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { session: true },
  });
  if (!exercise) return;
  await assertClientAccess(exercise.session.clientId);
  await prisma.exercise.delete({ where: { id: exerciseId } });
  await invalidateClientMetricsCache(exercise.session.clientId);
  revalidatePath(`/clients/${exercise.session.clientId}`);
}
