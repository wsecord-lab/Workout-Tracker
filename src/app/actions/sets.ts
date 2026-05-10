"use server";

import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/authz";
import { invalidateClientMetricsCache } from "@/lib/metrics";
import { revalidateClientWorkoutViews } from "@/lib/revalidate-client";
import { validateSet, validateSetDetails, validateSetUpdate, validateSetsBulk } from "@/lib/validations";

export type SetActionResult = { ok: true } | { ok: false; errors: Record<string, string> };

export type CreateSetsBulkResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

export async function createSet(
  exerciseId: string,
  formData: FormData
): Promise<SetActionResult> {
  const result = validateSet({
    weightLb: formData.get("weightLb"),
    reps: formData.get("reps"),
    rpe: formData.get("rpe"),
    notes: formData.get("notes"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { session: true, sets: { select: { orderIndex: true } } },
  });
  if (!exercise) return { ok: false, errors: { _: "Exercise not found" } };
  await assertClientAccess(exercise.session.clientId);
  const maxOrderIndex = exercise.sets.length > 0
    ? Math.max(...exercise.sets.map((s) => s.orderIndex))
    : -1;
  await prisma.set.create({
    data: {
      exerciseId,
      weightKg: result.data.weightKg,
      reps: result.data.reps,
      rpe: result.data.rpe,
      notes: result.data.notes,
      orderIndex: maxOrderIndex + 1,
    },
  });
  await invalidateClientMetricsCache(exercise.session.clientId);
  revalidateClientWorkoutViews(exercise.session.clientId);
  return { ok: true };
}

/** Full set update: weight, reps, RPE, notes. Trainer can edit all, client only own (via assertClientAccess). */
export async function updateSet(setId: string, formData: FormData): Promise<SetActionResult> {
  const result = validateSetUpdate({
    weightLb: formData.get("weightLb"),
    reps: formData.get("reps"),
    rpe: formData.get("rpe"),
    notes: formData.get("notes"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };
  const set = await prisma.set.findUnique({
    where: { id: setId },
    include: { exercise: { include: { session: true } } },
  });
  if (!set) return { ok: false, errors: { _: "Set not found" } };
  await assertClientAccess(set.exercise.session.clientId);
  await prisma.set.update({
    where: { id: setId },
    data: {
      weightKg: result.data.weightKg,
      reps: result.data.reps,
      rpe: result.data.rpe,
      notes: result.data.notes,
    },
  });
  await invalidateClientMetricsCache(set.exercise.session.clientId);
  revalidateClientWorkoutViews(set.exercise.session.clientId);
  return { ok: true };
}

/** Update only RPE and notes (backwards compatibility for existing UI). */
export async function updateSetDetails(
  setId: string,
  formData: FormData
): Promise<SetActionResult> {
  const result = validateSetDetails({
    rpe: formData.get("rpe"),
    notes: formData.get("notes"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };
  const set = await prisma.set.findUnique({
    where: { id: setId },
    include: { exercise: { include: { session: true } } },
  });
  if (!set) return { ok: false, errors: { _: "Set not found" } };
  await assertClientAccess(set.exercise.session.clientId);
  await prisma.set.update({
    where: { id: setId },
    data: { rpe: result.data.rpe, notes: result.data.notes },
  });
  await invalidateClientMetricsCache(set.exercise.session.clientId);
  revalidateClientWorkoutViews(set.exercise.session.clientId);
  return { ok: true };
}

/** Bulk create sets for an exercise. formData: exerciseId, setsJson (stringified array of { weight, reps?, rpe?, notes? }). */
export async function createSetsBulk(formData: FormData): Promise<CreateSetsBulkResult> {
  const exerciseId = formData.get("exerciseId");
  if (typeof exerciseId !== "string" || !exerciseId.trim()) {
    return { ok: false, errors: { exerciseId: "Exercise ID is required" } };
  }
  const setsJson = formData.get("setsJson");
  const result = validateSetsBulk(setsJson);
  if (!result.ok) return { ok: false, errors: result.errors };

  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId.trim() },
    include: { session: true },
  });
  if (!exercise) return { ok: false, errors: { _: "Exercise not found" } };
  await assertClientAccess(exercise.session.clientId);

  await prisma.$transaction(
    result.data.map((row) =>
      prisma.set.create({
        data: {
          exerciseId: exercise.id,
          weightKg: row.weightKg,
          reps: row.reps,
          rpe: row.rpe,
          notes: row.notes,
        },
      })
    )
  );
  await invalidateClientMetricsCache(exercise.session.clientId);
  revalidateClientWorkoutViews(exercise.session.clientId);
  return { ok: true };
}

/** Swap the orderIndex of two adjacent sets (for reordering). */
export async function swapSetOrder(
  setId1: string,
  setId2: string
): Promise<{ ok: boolean }> {
  const [set1, set2] = await Promise.all([
    prisma.set.findUnique({ where: { id: setId1 }, include: { exercise: { include: { session: true } } } }),
    prisma.set.findUnique({ where: { id: setId2 } }),
  ]);
  if (!set1 || !set2) return { ok: false };
  await assertClientAccess(set1.exercise.session.clientId);
  await prisma.$transaction([
    prisma.set.update({ where: { id: setId1 }, data: { orderIndex: set2.orderIndex } }),
    prisma.set.update({ where: { id: setId2 }, data: { orderIndex: set1.orderIndex } }),
  ]);
  revalidateClientWorkoutViews(set1.exercise.session.clientId);
  return { ok: true };
}

export async function deleteSet(setId: string): Promise<void> {
  const set = await prisma.set.findUnique({
    where: { id: setId },
    include: { exercise: { include: { session: true } } },
  });
  if (!set) return;
  await assertClientAccess(set.exercise.session.clientId);
  await prisma.set.delete({ where: { id: setId } });
  await invalidateClientMetricsCache(set.exercise.session.clientId);
  revalidateClientWorkoutViews(set.exercise.session.clientId);
}
