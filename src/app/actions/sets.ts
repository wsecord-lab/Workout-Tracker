"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { validateSet, validateSetDetails } from "@/lib/validations";

export type SetActionResult = { ok: true } | { ok: false; errors: Record<string, string> };

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
    include: { session: true },
  });
  if (!exercise) return { ok: false, errors: { _: "Exercise not found" } };
  await prisma.set.create({
    data: {
      exerciseId,
      weightKg: result.data.weightKg,
      reps: result.data.reps,
      rpe: result.data.rpe,
      notes: result.data.notes,
    },
  });
  revalidatePath(`/clients/${exercise.session.clientId}`);
  return { ok: true };
}

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
  await prisma.set.update({
    where: { id: setId },
    data: { rpe: result.data.rpe, notes: result.data.notes },
  });
  revalidatePath(`/clients/${set.exercise.session.clientId}`);
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
