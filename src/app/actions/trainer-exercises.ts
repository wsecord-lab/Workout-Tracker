"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireTrainer } from "@/lib/authz";
import { z } from "zod";

const NAME_MIN = 2;
const NAME_MAX = 60;

const addExerciseSchema = z
  .string()
  .trim()
  .min(NAME_MIN, `Name must be at least ${NAME_MIN} characters`)
  .max(NAME_MAX, `Name must be at most ${NAME_MAX} characters`)
  .refine((s) => /[a-zA-Z0-9]/.test(s), "Name must contain at least one letter or number");

/** normalizedName: lowercase, collapse spaces, for uniqueness */
function normalizedName(displayName: string): string {
  return displayName
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** display name: trim, collapse spaces */
function displayName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export type TrainerCatalogItem = { id: string; name: string; isArchived: boolean };

/** List trainer's catalog items. Default: active only. */
export async function listTrainerExercises(
  includeArchived = false
): Promise<TrainerCatalogItem[]> {
  const user = await requireTrainer();
  const items = await prisma.trainerExerciseCatalogItem.findMany({
    where: {
      trainerId: user.id,
      ...(includeArchived ? {} : { isArchived: false }),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isArchived: true },
  });
  return items;
}

export type AddTrainerExerciseResult =
  | { ok: true; item: TrainerCatalogItem }
  | { ok: false; error: string };

/** Add exercise to trainer's catalog. Idempotent: if same normalized name exists active, return it; if archived, unarchive and update name. */
export async function addTrainerExercise(name: string): Promise<AddTrainerExerciseResult> {
  const user = await requireTrainer();
  const parsed = addExerciseSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }
  const raw = parsed.data;
  const norm = normalizedName(raw);
  const display = displayName(raw);

  const existing = await prisma.trainerExerciseCatalogItem.findUnique({
    where: {
      trainerId_normalizedName: { trainerId: user.id, normalizedName: norm },
    },
  });

  if (existing) {
    if (!existing.isArchived) {
      return { ok: true, item: { id: existing.id, name: existing.name, isArchived: false } };
    }
    const updated = await prisma.trainerExerciseCatalogItem.update({
      where: { id: existing.id },
      data: { name: display, isArchived: false },
      select: { id: true, name: true, isArchived: true },
    });
    revalidatePath("/dashboard/exercises");
    return { ok: true, item: updated };
  }

  const created = await prisma.trainerExerciseCatalogItem.create({
    data: {
      trainerId: user.id,
      name: display,
      normalizedName: norm,
    },
    select: { id: true, name: true, isArchived: true },
  });
  revalidatePath("/dashboard/exercises");
  return { ok: true, item: created };
}

export type ArchiveTrainerExerciseResult = { ok: true } | { ok: false; error: string };

/** Archive (soft-remove) an exercise. Fails if not owned by current trainer. */
export async function archiveTrainerExercise(
  itemId: string
): Promise<ArchiveTrainerExerciseResult> {
  const user = await requireTrainer();
  const item = await prisma.trainerExerciseCatalogItem.findFirst({
    where: { id: itemId, trainerId: user.id },
  });
  if (!item) {
    return { ok: false, error: "Exercise not found or access denied." };
  }
  await prisma.trainerExerciseCatalogItem.update({
    where: { id: itemId },
    data: { isArchived: true },
  });
  revalidatePath("/dashboard/exercises");
  return { ok: true };
}

/** Unarchive an exercise. */
export async function unarchiveTrainerExercise(
  itemId: string
): Promise<ArchiveTrainerExerciseResult> {
  const user = await requireTrainer();
  const item = await prisma.trainerExerciseCatalogItem.findFirst({
    where: { id: itemId, trainerId: user.id },
  });
  if (!item) {
    return { ok: false, error: "Exercise not found or access denied." };
  }
  await prisma.trainerExerciseCatalogItem.update({
    where: { id: itemId },
    data: { isArchived: false },
  });
  revalidatePath("/dashboard/exercises");
  return { ok: true };
}

/** Add exercise to a trainer's catalog. Allowed when current user is that trainer OR a client of that trainer. Used from session "Add new exercise" flow. */
export async function addExerciseToTrainerCatalog(
  trainerId: string,
  name: string
): Promise<AddTrainerExerciseResult> {
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated." };
  const role = (session.user as { role?: string }).role;
  let allowed = false;
  if (role === "TRAINER" && session.user.id === trainerId) allowed = true;
  if (role === "CLIENT") {
    const client = await prisma.client.findFirst({
      where: { userId: session.user.id, trainerId },
      select: { id: true },
    });
    if (client) allowed = true;
  }
  if (!allowed) return { ok: false, error: "Access denied." };

  const parsed = addExerciseSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name" };
  }
  const raw = parsed.data;
  const norm = normalizedName(raw);
  const display = displayName(raw);

  const existing = await prisma.trainerExerciseCatalogItem.findUnique({
    where: {
      trainerId_normalizedName: { trainerId, normalizedName: norm },
    },
  });

  if (existing) {
    if (!existing.isArchived) {
      return { ok: true, item: { id: existing.id, name: existing.name, isArchived: false } };
    }
    const updated = await prisma.trainerExerciseCatalogItem.update({
      where: { id: existing.id },
      data: { name: display, isArchived: false },
      select: { id: true, name: true, isArchived: true },
    });
    revalidatePath("/dashboard/exercises");
    return { ok: true, item: updated };
  }

  const created = await prisma.trainerExerciseCatalogItem.create({
    data: {
      trainerId,
      name: display,
      normalizedName: norm,
    },
    select: { id: true, name: true, isArchived: true },
  });
  revalidatePath("/dashboard/exercises");
  return { ok: true, item: created };
}

/** List exercises for a trainer. Allowed when: current user is that trainer, OR current user is a client whose trainerId is that trainer. Used on client page for the exercise picker. */
export async function listTrainerExercisesForClient(
  trainerId: string
): Promise<TrainerCatalogItem[]> {
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user?.id) return [];
  const role = (session.user as { role?: string }).role;
  if (role === "TRAINER" && session.user.id === trainerId) {
    const items = await prisma.trainerExerciseCatalogItem.findMany({
      where: { trainerId, isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, isArchived: true },
    });
    return items;
  }
  if (role === "CLIENT") {
    const client = await prisma.client.findFirst({
      where: { userId: session.user.id, trainerId },
      select: { id: true },
    });
    if (!client) return [];
    const items = await prisma.trainerExerciseCatalogItem.findMany({
      where: { trainerId, isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, isArchived: true },
    });
    return items;
  }
  return [];
}
