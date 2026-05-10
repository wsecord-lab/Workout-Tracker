"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { sanitizeName } from "@/lib/sanitize";

const BLOCK_NAME_MAX = 100;
const ITEM_NAME_MAX = 200;
const ITEM_DETAILS_MAX = 400;

async function requireTrainer() {
  const user = await requireUser();
  if (user.role !== "TRAINER") throw new Error("Trainer only");
  return user;
}

// ─── Block CRUD ───────────────────────────────────────────────────────────────

export async function listWarmupBlocks() {
  const user = await requireTrainer();
  return prisma.warmupBlock.findMany({
    where: { trainerId: user.id, isArchived: false },
    orderBy: { createdAt: "asc" },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
}

export async function createWarmupBlock(
  name: string,
  items: { name: string; details?: string }[]
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireTrainer();
  const blockName = sanitizeName(name, BLOCK_NAME_MAX);
  if (!blockName) return { ok: false, error: "Name is required." };

  const block = await prisma.warmupBlock.create({
    data: {
      trainerId: user.id,
      name: blockName,
      items: {
        create: items
          .filter((i) => i.name.trim())
          .map((item, idx) => ({
            name: sanitizeName(item.name, ITEM_NAME_MAX) ?? item.name.slice(0, ITEM_NAME_MAX),
            details: item.details?.trim().slice(0, ITEM_DETAILS_MAX) || null,
            orderIndex: idx,
          })),
      },
    },
    select: { id: true },
  });
  revalidatePath("/dashboard");
  return { ok: true, id: block.id };
}

export async function updateWarmupBlock(
  blockId: string,
  name: string,
  items: { name: string; details?: string }[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireTrainer();
  const block = await prisma.warmupBlock.findFirst({
    where: { id: blockId, trainerId: user.id },
  });
  if (!block) return { ok: false, error: "Not found." };

  const blockName = sanitizeName(name, BLOCK_NAME_MAX);
  if (!blockName) return { ok: false, error: "Name is required." };

  // Delete old items and recreate
  await prisma.$transaction([
    prisma.warmupBlockItem.deleteMany({ where: { blockId } }),
    prisma.warmupBlock.update({
      where: { id: blockId },
      data: {
        name: blockName,
        items: {
          create: items
            .filter((i) => i.name.trim())
            .map((item, idx) => ({
              name: sanitizeName(item.name, ITEM_NAME_MAX) ?? item.name.slice(0, ITEM_NAME_MAX),
              details: item.details?.trim().slice(0, ITEM_DETAILS_MAX) || null,
              orderIndex: idx,
            })),
        },
      },
    }),
  ]);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteWarmupBlock(blockId: string): Promise<void> {
  const user = await requireTrainer();
  await prisma.warmupBlock.updateMany({
    where: { id: blockId, trainerId: user.id },
    data: { isArchived: true },
  });
  revalidatePath("/dashboard");
}

// ─── Assign to session ────────────────────────────────────────────────────────

export async function assignWarmupToSession(
  sessionId: string,
  warmupBlockId: string | null
): Promise<void> {
  const user = await requireTrainer();
  // Verify the session belongs to one of this trainer's clients
  const session = await prisma.workoutSession.findFirst({
    where: { id: sessionId, client: { trainerId: user.id } },
    select: { id: true, clientId: true },
  });
  if (!session) return;

  if (warmupBlockId) {
    // Verify block belongs to trainer
    const block = await prisma.warmupBlock.findFirst({
      where: { id: warmupBlockId, trainerId: user.id },
    });
    if (!block) return;
  }

  await prisma.workoutSession.update({
    where: { id: sessionId },
    data: { warmupBlockId },
  });
  revalidatePath(`/clients/${session.clientId}`);
}
