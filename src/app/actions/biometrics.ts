"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { toStorage } from "@/lib/units";

export type BiometricResult =
  | { ok: true }
  | { ok: false; errors: { weightLb?: string; date?: string } };

export async function addBiometricRecord(
  clientId: string,
  weightLb: number,
  dateISO: string
): Promise<BiometricResult> {
  if (weightLb <= 0 || weightLb > 2000) {
    return { ok: false, errors: { weightLb: "Weight must be 1–2000 lb" } };
  }

  // Parse YYYY-MM-DD or ISO string; reject invalid dates
  const parsed = new Date(dateISO);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, errors: { date: "Invalid date" } };
  }
  const date = parsed;

  const weightKg = Math.round(toStorage(weightLb, "weight") * 1e6) / 1e6;

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { ok: false, errors: { weightLb: "Client not found" } };

  await prisma.clientWeightRecord.create({
    data: {
      clientId,
      weightKg,
      recordedAt: date,
    },
  });

  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
