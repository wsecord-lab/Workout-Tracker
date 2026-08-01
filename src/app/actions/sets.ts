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
      // Logged live, so it is completed by definition. Planned sets are created
      // by createPlannedSets instead, which leaves completedAt null.
      completedAt: new Date(),
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
  // Editing a set that hasn't been performed yet means editing the *plan*, so
  // the snapshot moves with it. Editing a completed set changes only the actual,
  // preserving what was originally prescribed.
  const editingPlan = set.completedAt == null;
  await prisma.set.update({
    where: { id: setId },
    data: {
      weightKg: result.data.weightKg,
      reps: result.data.reps,
      rpe: result.data.rpe,
      notes: result.data.notes,
      ...(editingPlan
        ? { plannedWeightKg: result.data.weightKg, plannedReps: result.data.reps }
        : {}),
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
    include: { session: true, sets: { select: { orderIndex: true } } },
  });
  if (!exercise) return { ok: false, errors: { _: "Exercise not found" } };
  await assertClientAccess(exercise.session.clientId);

  const maxOrderIndex = exercise.sets.length > 0
    ? Math.max(...exercise.sets.map((s) => s.orderIndex))
    : -1;
  const completedAt = new Date();

  await prisma.$transaction(
    result.data.map((row, i) =>
      prisma.set.create({
        data: {
          exerciseId: exercise.id,
          weightKg: row.weightKg,
          reps: row.reps,
          rpe: row.rpe,
          notes: row.notes,
          orderIndex: maxOrderIndex + 1 + i,
          completedAt,
        },
      })
    )
  );
  await invalidateClientMetricsCache(exercise.session.clientId);
  revalidateClientWorkoutViews(exercise.session.clientId);
  return { ok: true };
}

/**
 * Prescribe sets ahead of time. The target lives in both weightKg/reps (so every
 * display path can read it without special-casing) and in the planned* snapshot
 * (so we can still show the plan after the actual overwrites it).
 * completedAt stays null until someone checks the set off.
 */
export async function createPlannedSets(formData: FormData): Promise<CreateSetsBulkResult> {
  const exerciseId = formData.get("exerciseId");
  if (typeof exerciseId !== "string" || !exerciseId.trim()) {
    return { ok: false, errors: { exerciseId: "Exercise ID is required" } };
  }
  const result = validateSetsBulk(formData.get("setsJson"));
  if (!result.ok) return { ok: false, errors: result.errors };

  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId.trim() },
    include: { session: true, sets: { select: { orderIndex: true } } },
  });
  if (!exercise) return { ok: false, errors: { _: "Exercise not found" } };
  await assertClientAccess(exercise.session.clientId);

  const maxOrderIndex = exercise.sets.length > 0
    ? Math.max(...exercise.sets.map((s) => s.orderIndex))
    : -1;

  await prisma.set.createMany({
    data: result.data.map((row, i) => ({
      exerciseId: exercise.id,
      weightKg: row.weightKg,
      reps: row.reps,
      plannedWeightKg: row.weightKg,
      plannedReps: row.reps,
      completedAt: null,
      orderIndex: maxOrderIndex + 1 + i,
    })),
  });
  await invalidateClientMetricsCache(exercise.session.clientId);
  revalidateClientWorkoutViews(exercise.session.clientId);
  return { ok: true };
}

/**
 * Check a set off. With no formData the actual equals the plan — the common case,
 * one tap. With formData the caller did something different, and both the plan
 * snapshot and the new actual are kept.
 * Idempotent: re-completing an already-complete set leaves completedAt alone.
 */
export async function completeSet(setId: string, formData?: FormData): Promise<SetActionResult> {
  const set = await prisma.set.findUnique({
    where: { id: setId },
    include: { exercise: { include: { session: true } } },
  });
  if (!set) return { ok: false, errors: { _: "Set not found" } };
  await assertClientAccess(set.exercise.session.clientId);

  let actual: { weightKg: number; reps: number; rpe: number | null; notes: string | null } | null = null;
  if (formData) {
    const result = validateSetUpdate({
      weightLb: formData.get("weightLb"),
      reps: formData.get("reps"),
      rpe: formData.get("rpe"),
      notes: formData.get("notes"),
    });
    if (!result.ok) return { ok: false, errors: result.errors };
    actual = result.data;
  }

  await prisma.set.update({
    where: { id: setId },
    data: {
      completedAt: set.completedAt ?? new Date(),
      // Capture the plan the first time it's completed, so "planned X → did Y"
      // still works for a set logged straight from a prescription.
      plannedWeightKg: set.plannedWeightKg ?? set.weightKg,
      plannedReps: set.plannedReps ?? set.reps,
      ...(actual
        ? { weightKg: actual.weightKg, reps: actual.reps, rpe: actual.rpe, notes: actual.notes }
        : {}),
    },
  });
  await invalidateClientMetricsCache(set.exercise.session.clientId);
  revalidateClientWorkoutViews(set.exercise.session.clientId);
  return { ok: true };
}

/** Uncheck a set. Reverts the actual back to the plan when one was recorded. */
export async function uncompleteSet(setId: string): Promise<SetActionResult> {
  const set = await prisma.set.findUnique({
    where: { id: setId },
    include: { exercise: { include: { session: true } } },
  });
  if (!set) return { ok: false, errors: { _: "Set not found" } };
  await assertClientAccess(set.exercise.session.clientId);

  const hasPlan = set.plannedWeightKg != null && set.plannedReps != null;
  await prisma.set.update({
    where: { id: setId },
    data: {
      completedAt: null,
      // An ad-hoc set that was never planned keeps its numbers; there's nothing
      // to revert to.
      ...(hasPlan ? { weightKg: set.plannedWeightKg!, reps: set.plannedReps! } : {}),
    },
  });
  await invalidateClientMetricsCache(set.exercise.session.clientId);
  revalidateClientWorkoutViews(set.exercise.session.clientId);
  return { ok: true };
}

/**
 * One-shot migration of check-off state out of the old
 * `workout_checked_<sessionId>` localStorage key and into the database.
 *
 * Only touches sets that belong to this session and are still incomplete, and
 * no-ops entirely once the session is finished — otherwise a stale key on a
 * second device could resurrect checks on a workout that ended elsewhere.
 */
export async function syncCheckedSets(
  sessionId: string,
  setIds: string[]
): Promise<{ ok: boolean; migrated: number }> {
  if (setIds.length === 0) return { ok: true, migrated: 0 };
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    select: { clientId: true, finishedAt: true },
  });
  if (!session) return { ok: false, migrated: 0 };
  await assertClientAccess(session.clientId);
  if (session.finishedAt) return { ok: true, migrated: 0 };

  const now = new Date();
  const { count } = await prisma.set.updateMany({
    where: {
      id: { in: setIds },
      completedAt: null,
      exercise: { sessionId, deletedAt: null },
    },
    data: { completedAt: now },
  });
  if (count > 0) {
    await invalidateClientMetricsCache(session.clientId);
    revalidateClientWorkoutViews(session.clientId);
  }
  return { ok: true, migrated: count };
}

export type ReorderResult = { ok: true } | { ok: false; error: string };

/**
 * Rewrite every set's orderIndex for one exercise, from a drag-and-drop reorder.
 *
 * `orderedSetIds` must be exactly the exercise's current set ids, in the new
 * order. That equality check is the security boundary: assertClientAccess only
 * validates the *exercise*, so without it a caller could smuggle another
 * client's setId into the array and renumber a row they can't otherwise touch.
 * It also rejects a stale client whose list no longer matches the database.
 */
export async function reorderSets(
  exerciseId: string,
  orderedSetIds: string[]
): Promise<ReorderResult> {
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { session: { select: { clientId: true } }, sets: { select: { id: true } } },
  });
  if (!exercise) return { ok: false, error: "Exercise not found" };
  await assertClientAccess(exercise.session.clientId);

  const existingIds = new globalThis.Set(exercise.sets.map((s) => s.id));
  const incomingIds = new globalThis.Set(orderedSetIds);
  if (
    orderedSetIds.length !== exercise.sets.length ||
    incomingIds.size !== orderedSetIds.length ||
    !orderedSetIds.every((id) => existingIds.has(id))
  ) {
    return { ok: false, error: "Set list does not match this exercise" };
  }

  await prisma.$transaction(
    orderedSetIds.map((id, i) =>
      prisma.set.update({ where: { id }, data: { orderIndex: i } })
    )
  );
  revalidateClientWorkoutViews(exercise.session.clientId);
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
