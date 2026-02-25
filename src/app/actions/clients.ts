"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { validateClient } from "@/lib/validations";

export type ClientActionResult =
  | { ok: true; id?: string }
  | { ok: false; errors: Record<string, string> };

export async function createClient(formData: FormData): Promise<ClientActionResult> {
  const result = validateClient({
    name: formData.get("name"),
    age: formData.get("age"),
    heightIn: formData.get("heightIn"),
    bodyWeightLb: formData.get("bodyWeightLb"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };
  const client = await prisma.client.create({
    data: {
      ...result.data,
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
    heightIn: formData.get("heightIn"),
    bodyWeightLb: formData.get("bodyWeightLb"),
  });
  if (!result.ok) return { ok: false, errors: result.errors };
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
  await prisma.client.delete({ where: { id } });
  revalidatePath("/");
}
