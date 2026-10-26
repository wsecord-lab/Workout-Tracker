import type { Prisma } from "@prisma/client";
import { formatWeight } from "@/lib/units";

/**
 * THE filter for "sets that were actually performed".
 *
 * A Set row with `completedAt == null` is a *planned* set: the trainer prescribed
 * it but nobody has done it yet. Its `weightKg`/`reps` hold the target, which
 * looks exactly like an actual to any query that forgets to filter — so every
 * aggregate, chart, export, and history lookup must use this constant.
 *
 * Never inline `{ completedAt: { not: null } }` elsewhere.
 */
export const COMPLETED_SET_WHERE = {
  completedAt: { not: null },
} satisfies Prisma.SetWhereInput;

/** The subset of Set fields the helpers below need. Structural so it accepts
 *  Prisma rows, JSON-serialized rows, and optimistic client-side stand-ins. */
export type SetLike = {
  weightKg: number;
  reps: number;
  plannedWeightKg: number | null;
  plannedReps: number | null;
  completedAt: Date | string | null;
};

export function isCompletedSet(s: Pick<SetLike, "completedAt">): boolean {
  return s.completedAt != null;
}

/** Prescribed but never performed — renders as "skipped" once the workout ends. */
export function isPlannedOnly(s: Pick<SetLike, "completedAt">): boolean {
  return s.completedAt == null;
}

/** True when the set was done, was planned, and the actual differs from the plan. */
export function planDiffers(s: SetLike): boolean {
  if (!isCompletedSet(s)) return false;
  if (s.plannedWeightKg == null || s.plannedReps == null) return false;
  return s.plannedWeightKg !== s.weightKg || s.plannedReps !== s.reps;
}

/** "3×5 @ 185 lb", or "5 @ 185 lb, 5 @ 175 lb" when the sets aren't uniform. */
function describeSets(sets: Array<Pick<SetLike, "weightKg" | "reps">>): string | null {
  if (sets.length === 0) return null;
  const first = sets[0];
  const uniform = sets.every((s) => s.weightKg === first.weightKg && s.reps === first.reps);
  if (uniform) {
    return `${sets.length}×${first.reps} @ ${formatWeight(first.weightKg)}`;
  }
  return sets.map((s) => `${s.reps} @ ${formatWeight(s.weightKg)}`).join(", ");
}

export function summarizeExerciseSets(sets: SetLike[]): {
  totalCount: number;
  completedCount: number;
  skippedCount: number;
  plannedLabel: string | null;
  completedLabel: string | null;
} {
  const completed = sets.filter(isCompletedSet);
  // A set counts toward the plan if it was prescribed — either it still is
  // (planned-only), or it was completed and carries a plan snapshot.
  const planned = sets
    .map((s) =>
      s.plannedWeightKg != null && s.plannedReps != null
        ? { weightKg: s.plannedWeightKg, reps: s.plannedReps }
        : isPlannedOnly(s)
          ? { weightKg: s.weightKg, reps: s.reps }
          : null
    )
    .filter((s): s is { weightKg: number; reps: number } => s != null);

  return {
    totalCount: sets.length,
    completedCount: completed.length,
    skippedCount: sets.length - completed.length,
    plannedLabel: describeSets(planned),
    completedLabel: describeSets(completed),
  };
}

/** "planned 185 lb×5 → did 175 lb×5", or null when there's nothing to compare. */
export function formatPlanVsActual(s: SetLike): string | null {
  if (!planDiffers(s)) return null;
  return `planned ${formatWeight(s.plannedWeightKg!)}×${s.plannedReps} → did ${formatWeight(s.weightKg)}×${s.reps}`;
}

type OrderedSetLike = Pick<SetLike, "weightKg" | "reps" | "completedAt"> & {
  id: string;
  orderIndex: number;
};

/**
 * Sets that "apply to the rest" would change: the ones after `sourceId` in the
 * same exercise that haven't been done yet and don't already match `values`.
 * Completed sets are history and are never touched.
 */
export function findSetsToAutofill<T extends OrderedSetLike>(
  sets: T[],
  sourceId: string,
  values: { weightKg: number; reps: number }
): T[] {
  const source = sets.find((s) => s.id === sourceId);
  if (!source) return [];
  return sets.filter(
    (s) =>
      s.id !== sourceId &&
      s.orderIndex > source.orderIndex &&
      isPlannedOnly(s) &&
      !(sameWeight(s.weightKg, values.weightKg) && s.reps === values.reps)
  );
}

/** Weights are stored in kg, so a lb round-trip can leave tiny float noise. */
function sameWeight(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}
