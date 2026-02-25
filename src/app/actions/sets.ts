"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { validateSet } from "@/lib/validations";

export type SetActionResult = { ok: true } | { ok: false; errors: Record<string, string> };

export async function createSet(
  exerciseId: string,
  formData: FormData
): Promise<SetActionResult> {
  const result = validateSet({
    weightLb: formData.get("weightLb"),
    reps: formData.get("reps"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };
  const exercise = await prisma.exercise.findUnique({
    where: { id: exerciseId },
    include: { session: true },
  });
  if (!exercise) return { ok: false, errors: { _: "Exercise not found" } };
  await prisma.set.create({
    data: {
      exerciseId,
      weightKg: result.data.weightKg,
      reps: result.data.reps,
    },
  });
  revalidatePath(`/clients/${exercise.session.clientId}`);
  return { ok: true };
}

export async function deleteSet(setId: string): Promise<void> {
  const set = await prisma.set.findUnique({
    where: { id: setId },
    include: { exercise: { include: { session: true } } },
  });
  if (!set) return;
  await prisma.set.delete({ where: { id: setId } });
  revalidatePath(`/clients/${set.exercise.session.clientId}`);
}
