"use server";

import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/authz";
import { revalidateClientWorkoutViews } from "@/lib/revalidate-client";
import { parseWarmupLines, WARMUP_ITEM_MAX, WARMUP_ITEMS_MAX } from "@/lib/session-warmup";

export type WarmupActionResult = { ok: true } | { ok: false; error: string };

async function sessionFor(sessionId: string) {
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    select: { id: true, clientId: true },
  });
  if (!session) return null;
  await assertClientAccess(session.clientId);
  return session;
}

async function itemFor(itemId: string) {
  const item = await prisma.sessionWarmupItem.findUnique({
    where: { id: itemId },
    include: { session: { select: { clientId: true } } },
  });
  if (!item) return null;
  await assertClientAccess(item.session.clientId);
  return item;
}

/** Add one or more warmup lines (pasted text is split on new lines). */
export async function addWarmupItems(sessionId: string, text: string): Promise<WarmupActionResult> {
  const lines = parseWarmupLines(text);
  if (lines.length === 0) return { ok: false, error: "Type a warmup item first." };
  const session = await sessionFor(sessionId);
  if (!session) return { ok: false, error: "Workout not found." };

  const existing = await prisma.sessionWarmupItem.findMany({
    where: { sessionId },
    select: { orderIndex: true },
  });
  if (existing.length + lines.length > WARMUP_ITEMS_MAX) {
    return { ok: false, error: `A warmup can have up to ${WARMUP_ITEMS_MAX} items.` };
  }
  const start = existing.length > 0 ? Math.max(...existing.map((e) => e.orderIndex)) + 1 : 0;
  await prisma.sessionWarmupItem.createMany({
    data: lines.map((line, i) => ({ sessionId, text: line, orderIndex: start + i })),
  });
  revalidateClientWorkoutViews(session.clientId);
  return { ok: true };
}

export async function updateWarmupItem(itemId: string, text: string): Promise<WarmupActionResult> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, WARMUP_ITEM_MAX);
  if (!clean) return { ok: false, error: "Warmup item can't be empty." };
  const item = await itemFor(itemId);
  if (!item) return { ok: false, error: "Warmup item not found." };
  await prisma.sessionWarmupItem.update({ where: { id: itemId }, data: { text: clean } });
  revalidateClientWorkoutViews(item.session.clientId);
  return { ok: true };
}

export async function setWarmupItemDone(itemId: string, done: boolean): Promise<WarmupActionResult> {
  const item = await itemFor(itemId);
  if (!item) return { ok: false, error: "Warmup item not found." };
  await prisma.sessionWarmupItem.update({
    where: { id: itemId },
    data: { doneAt: done ? (item.doneAt ?? new Date()) : null },
  });
  revalidateClientWorkoutViews(item.session.clientId);
  return { ok: true };
}

export async function deleteWarmupItem(itemId: string): Promise<WarmupActionResult> {
  const item = await itemFor(itemId);
  if (!item) return { ok: false, error: "Warmup item not found." };
  await prisma.sessionWarmupItem.delete({ where: { id: itemId } });
  revalidateClientWorkoutViews(item.session.clientId);
  return { ok: true };
}
