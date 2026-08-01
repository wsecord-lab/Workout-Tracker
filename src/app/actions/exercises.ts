"use server";

import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/authz";
import { invalidateClientMetricsCache } from "@/lib/metrics";
import { revalidateClientWorkoutViews } from "@/lib/revalidate-client";
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

/**
 * Next free orderIndex for a session. Counts soft-deleted exercises too, so a
 * later restoreExercise can't collide with an index handed out in the meantime.
 */
async function nextExerciseOrderIndex(sessionId: string): Promise<number> {
  const max = await prisma.exercise.aggregate({
    where: { sessionId },
    _max: { orderIndex: true },
  });
  return (max._max.orderIndex ?? -1) + 1;
}

export async function createExercise(
  sessionId: string,
  name: string,
  catalogExerciseId?: string | null
): Promise<string | null> {
  const session = await prisma.workoutSession.findUnique({ where: { id: sessionId }, include: { client: true } });
  if (!session) return null;
  await assertClientAccess(session.clientId);
  const orderIndex = await nextExerciseOrderIndex(sessionId);
  if (catalogExerciseId) {
    const catalog = await prisma.exerciseCatalog.findUnique({ where: { id: catalogExerciseId }, select: { name: true } });
    if (!catalog) return null;
    const exercise = await prisma.exercise.create({
      data: { sessionId, name: catalog.name, catalogExerciseId, orderIndex },
      select: { id: true },
    });
    await invalidateClientMetricsCache(session.clientId);
    revalidateClientWorkoutViews(session.clientId);
    return exercise.id;
  }
  const sanitizedName = sanitizeName(name, EXERCISE_NAME_MAX_LENGTH);
  if (!sanitizedName) return null;
  const exercise = await prisma.exercise.create({
    data: { sessionId, name: sanitizedName, orderIndex },
    select: { id: true },
  });
  await invalidateClientMetricsCache(session.clientId);
  revalidateClientWorkoutViews(session.clientId);
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
  revalidateClientWorkoutViews(exercise.session.clientId);
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
  revalidateClientWorkoutViews(exercise.session.clientId);
  return { clientId: exercise.session.clientId };
}

/** Update an exercise's notes. */
export async function updateExerciseNotes(
  exerciseId: string,
  notes: string | null
): Promise<void> {
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { session: true },
  });
  if (!exercise) return;
  await assertClientAccess(exercise.session.clientId);
  const sanitized = notes?.trim() || null;
  await prisma.exercise.update({
    where: { id: exerciseId },
    data: { notes: sanitized },
  });
  revalidateClientWorkoutViews(exercise.session.clientId);
}

export type ReorderResult = { ok: true } | { ok: false; error: string };

/**
 * Rewrite every exercise's orderIndex for one session, from a drag-and-drop
 * reorder. `orderedExerciseIds` must be exactly the session's live (non-deleted)
 * exercise ids — see reorderSets for why that equality check is load-bearing.
 *
 * Live exercises are renumbered from 0. Soft-deleted rows keep their old index;
 * a restore may land them in an odd spot, which is preferable to resurrecting
 * them into the middle of a reordered list.
 */
export async function reorderExercises(
  sessionId: string,
  orderedExerciseIds: string[]
): Promise<ReorderResult> {
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    select: {
      clientId: true,
      exercises: { where: { deletedAt: null }, select: { id: true } },
    },
  });
  if (!session) return { ok: false, error: "Session not found" };
  await assertClientAccess(session.clientId);

  const existingIds = new Set(session.exercises.map((e) => e.id));
  const incomingIds = new Set(orderedExerciseIds);
  if (
    orderedExerciseIds.length !== session.exercises.length ||
    incomingIds.size !== orderedExerciseIds.length ||
    !orderedExerciseIds.every((id) => existingIds.has(id))
  ) {
    return { ok: false, error: "Exercise list does not match this session" };
  }

  await prisma.$transaction(
    orderedExerciseIds.map((id, i) =>
      prisma.exercise.update({ where: { id }, data: { orderIndex: i } })
    )
  );
  revalidateClientWorkoutViews(session.clientId);
  return { ok: true };
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
  revalidateClientWorkoutViews(exercise.session.clientId);
}
