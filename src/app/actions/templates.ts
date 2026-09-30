"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireTrainer } from "@/lib/authz";
import {
  validateTemplateCreate,
  validateTemplateUpdate,
  type TemplateFormErrors,
  type TemplateItemValidated,
} from "@/lib/validations";

export type TemplateItemDTO = {
  id: string;
  orderIndex: number;
  exerciseName: string;
  normalizedName: string;
  plannedSetCount: number | null;
  plannedWeightKg: number | null;
  plannedReps: number | null;
};

export type TemplateWithItems = {
  id: string;
  trainerId: string;
  name: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  items: TemplateItemDTO[];
};

export type ListTemplatesResult =
  | { ok: true; templates: TemplateWithItems[] }
  | { ok: false; error: string };

function mapItem(i: {
  id: string;
  orderIndex: number;
  exerciseName: string;
  normalizedName: string;
  plannedSetCount: number | null;
  plannedWeightKg: number | null;
  plannedReps: number | null;
}): TemplateItemDTO {
  return {
    id: i.id,
    orderIndex: i.orderIndex,
    exerciseName: i.exerciseName,
    normalizedName: i.normalizedName,
    plannedSetCount: i.plannedSetCount,
    plannedWeightKg: i.plannedWeightKg,
    plannedReps: i.plannedReps,
  };
}

function mapTemplate(t: {
  id: string;
  trainerId: string;
  name: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  items: Parameters<typeof mapItem>[0][];
}): TemplateWithItems {
  return {
    id: t.id,
    trainerId: t.trainerId,
    name: t.name,
    isArchived: t.isArchived,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    items: t.items.map(mapItem),
  };
}

function itemCreateData(item: TemplateItemValidated) {
  return {
    orderIndex: item.orderIndex,
    exerciseName: item.exerciseName,
    normalizedName: item.normalizedName,
    plannedSetCount: item.plannedSetCount,
    plannedWeightKg: item.plannedWeightKg,
    plannedReps: item.plannedReps,
  };
}

/** List templates for the current trainer. Trainer-only. */
export async function listTemplates(
  includeArchived = false
): Promise<ListTemplatesResult> {
  let trainer;
  try {
    trainer = await requireTrainer();
  } catch {
    return { ok: false, error: "Forbidden" };
  }
  const templates = await prisma.workoutTemplate.findMany({
    where: {
      trainerId: trainer.id,
      ...(includeArchived ? {} : { isArchived: false }),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      items: { orderBy: { orderIndex: "asc" } },
    },
  });
  return {
    ok: true,
    templates: templates.map(mapTemplate),
  };
}

export type CreateTemplateResult =
  | { ok: true; template: TemplateWithItems }
  | { ok: false; errors: TemplateFormErrors };

/** Create a trainer-scoped template. Trainer-only. */
export async function createTemplate(data: {
  name: unknown;
  exerciseNames?: unknown;
  items?: unknown;
}): Promise<CreateTemplateResult> {
  let trainer;
  try {
    trainer = await requireTrainer();
  } catch {
    return { ok: false, errors: { _: "Forbidden" } };
  }
  const validated = validateTemplateCreate(data);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const { name, items } = validated.data;
  const template = await prisma.workoutTemplate.create({
    data: {
      trainerId: trainer.id,
      name,
      items: {
        create: items.map(itemCreateData),
      },
    },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  revalidatePath("/dashboard");
  return { ok: true, template: mapTemplate(template) };
}

export type UpdateTemplateResult =
  | { ok: true; template: TemplateWithItems }
  | { ok: false; errors: TemplateFormErrors };

/** Update template name and/or items. Trainer-only; must own the template. */
export async function updateTemplate(
  id: string,
  data: { name?: unknown; items?: unknown }
): Promise<UpdateTemplateResult> {
  let trainer;
  try {
    trainer = await requireTrainer();
  } catch {
    return { ok: false, errors: { _: "Forbidden" } };
  }
  const validated = validateTemplateUpdate(data);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const existing = await prisma.workoutTemplate.findFirst({
    where: { id, trainerId: trainer.id },
    select: { id: true },
  });
  if (!existing) return { ok: false, errors: { _: "Template not found" } };
  const updateData: {
    name?: string;
    items?: {
      deleteMany: Record<string, never>;
      create: ReturnType<typeof itemCreateData>[];
    };
  } = {};
  if (validated.data.name !== undefined) updateData.name = validated.data.name;
  if (validated.data.items !== undefined && validated.data.items.length > 0) {
    updateData.items = {
      deleteMany: {},
      create: validated.data.items.map(itemCreateData),
    };
  }
  const template = await prisma.workoutTemplate.update({
    where: { id },
    data: updateData,
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  revalidatePath("/dashboard");
  return { ok: true, template: mapTemplate(template) };
}

export type ArchiveTemplateResult = { ok: true } | { ok: false; error: string };

/** Archive a template (soft delete). Trainer-only; must own the template. */
export async function archiveTemplate(id: string): Promise<ArchiveTemplateResult> {
  let trainer;
  try {
    trainer = await requireTrainer();
  } catch {
    return { ok: false, error: "Forbidden" };
  }
  const result = await prisma.workoutTemplate.updateMany({
    where: { id, trainerId: trainer.id },
    data: { isArchived: true },
  });
  if (result.count === 0) return { ok: false, error: "Template not found" };
  revalidatePath("/dashboard");
  return { ok: true };
}

export type RestoreTemplateResult = { ok: true } | { ok: false; error: string };

/** Restore an archived template. Trainer-only; must own the template. */
export async function restoreTemplate(id: string): Promise<RestoreTemplateResult> {
  let trainer;
  try {
    trainer = await requireTrainer();
  } catch {
    return { ok: false, error: "Forbidden" };
  }
  const result = await prisma.workoutTemplate.updateMany({
    where: { id, trainerId: trainer.id },
    data: { isArchived: false },
  });
  if (result.count === 0) return { ok: false, error: "Template not found" };
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Get a single template by id (for apply flow). Trainer-only; must own the template. */
export async function getTemplate(
  id: string
): Promise<{ ok: true; template: TemplateWithItems } | { ok: false; error: string }> {
  let trainer;
  try {
    trainer = await requireTrainer();
  } catch {
    return { ok: false, error: "Forbidden" };
  }
  const template = await prisma.workoutTemplate.findFirst({
    where: { id, trainerId: trainer.id, isArchived: false },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  if (!template) return { ok: false, error: "Template not found" };
  return { ok: true, template: mapTemplate(template) };
}
