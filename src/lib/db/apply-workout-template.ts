import type { Prisma } from "@prisma/client";

export type TemplateItemForApply = {
  exerciseName: string;
  orderIndex: number;
  plannedSetCount: number | null;
  plannedWeightKg: number | null;
  plannedReps: number | null;
};

/**
 * Create exercises (and optional planned sets) from template items into a session.
 * Planned sets mirror createPlannedSets: weight/reps as targets, completedAt null.
 */
export async function materializeTemplateItems(
  tx: Prisma.TransactionClient,
  sessionId: string,
  items: TemplateItemForApply[],
  baseIndex: number
): Promise<void> {
  const ordered = [...items].sort((a, b) => a.orderIndex - b.orderIndex);
  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];
    const exercise = await tx.exercise.create({
      data: {
        sessionId,
        name: item.exerciseName,
        orderIndex: baseIndex + i,
      },
      select: { id: true },
    });
    const count = item.plannedSetCount;
    const weightKg = item.plannedWeightKg;
    const reps = item.plannedReps;
    if (
      count != null &&
      count > 0 &&
      weightKg != null &&
      reps != null
    ) {
      await tx.set.createMany({
        data: Array.from({ length: count }, (_, j) => ({
          exerciseId: exercise.id,
          weightKg,
          reps,
          plannedWeightKg: weightKg,
          plannedReps: reps,
          completedAt: null,
          orderIndex: j,
        })),
      });
    }
  }
}
