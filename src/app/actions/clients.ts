"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertClientAccess, requireTrainer } from "@/lib/authz";
import { validateClient } from "@/lib/validations";

export type ClientActionResult =
  | { ok: true; id?: string }
  | { ok: false; errors: Record<string, string> };

export async function createClient(formData: FormData): Promise<ClientActionResult> {
  const user = await requireTrainer();
  const result = validateClient(
    {
      name: formData.get("name"),
      age: formData.get("age"),
      heightFeet: formData.get("heightFeet"),
      heightInInches: formData.get("heightInInches"),
      bodyWeightLb: formData.get("bodyWeightLb"),
    },
    { optionalFields: true }
  );
  if (!result.ok) return { ok: false, errors: result.errors };
  const client = await prisma.client.create({
    data: {
      ...result.data,
      trainerId: user.id,
      weightRecords: {
        create: { weightKg: result.data.bodyWeightKg },
      },
    },
  });
  revalidatePath("/");
  return { ok: true, id: client.id };
}

export async function updateClient(
  id: string,
  formData: FormData
): Promise<ClientActionResult> {
  const result = validateClient({
    name: formData.get("name"),
    age: formData.get("age"),
    heightFeet: formData.get("heightFeet"),
    heightInInches: formData.get("heightInInches"),
    bodyWeightLb: formData.get("bodyWeightLb"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };
  await assertClientAccess(id);
  const existing = await prisma.client.findUnique({ where: { id } });
  await prisma.client.update({ where: { id }, data: result.data });
  if (existing && existing.bodyWeightKg !== result.data.bodyWeightKg) {
    await prisma.clientWeightRecord.create({
      data: { clientId: id, weightKg: result.data.bodyWeightKg },
    });
  }
  revalidatePath("/");
  revalidatePath(`/clients/${id}`);
  revalidatePath(`/clients/${id}/edit`);
  return { ok: true };
}

export async function deleteClient(id: string): Promise<void> {
  await requireTrainer();
  await assertClientAccess(id);
  await prisma.client.delete({ where: { id } });
  revalidatePath("/");
}

/** Trainer-only: link a client profile to a user account by username. */
export async function linkUserToClient(
  clientId: string,
  username: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireTrainer();
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { ok: false, error: "Client not found" };
  const trimmed = username.trim().toLowerCase();
  if (!trimmed) return { ok: false, error: "Username is required" };
  const user = await prisma.user.findUnique({ where: { email: trimmed } });
  if (!user) return { ok: false, error: "User not found with that username" };
  if (user.role !== "CLIENT") return { ok: false, error: "User is not a client account" };
  await prisma.client.update({
    where: { id: clientId },
    data: { userId: user.id },
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
  revalidatePath("/dashboard");
  return { ok: true };
}
