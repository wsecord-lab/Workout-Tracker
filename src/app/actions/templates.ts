"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireTrainer } from "@/lib/authz";
import {
  validateTemplateCreate,
  validateTemplateUpdate,
  type TemplateFormErrors,
} from "@/lib/validations";

export type TemplateWithItems = {
  id: string;
  name: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  items: { id: string; orderIndex: number; exerciseName: string; normalizedName: string }[];
};

export type ListTemplatesResult =
  | { ok: true; templates: TemplateWithItems[] }
  | { ok: false; error: string };

/** List global templates. Trainer-only. */
export async function listTemplates(
  includeArchived = false
): Promise<ListTemplatesResult> {
  try {
    await requireTrainer();
  } catch {
    return { ok: false, error: "Forbidden" };
  }
  const templates = await prisma.workoutTemplate.findMany({
    where: includeArchived ? {} : { isArchived: false },
    orderBy: { updatedAt: "desc" },
    include: {
      items: { orderBy: { orderIndex: "asc" } },
    },
  });
  return {
    ok: true,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      isArchived: t.isArchived,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      items: t.items.map((i) => ({
        id: i.id,
        orderIndex: i.orderIndex,
        exerciseName: i.exerciseName,
        normalizedName: i.normalizedName,
      })),
    })),
  };
}

export type CreateTemplateResult =
  | { ok: true; template: TemplateWithItems }
  | { ok: false; errors: TemplateFormErrors };

/** Create a global template. Trainer-only. */
export async function createTemplate(data: {
  name: unknown;
  exerciseNames?: unknown;
}): Promise<CreateTemplateResult> {
  try {
    await requireTrainer();
  } catch {
    return { ok: false, errors: { _: "Forbidden" } };
  }
  const validated = validateTemplateCreate(data);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const { name, items } = validated.data;
  const template = await prisma.workoutTemplate.create({
    data: {
      name,
      items: {
        create: items.map((item) => ({
          orderIndex: item.orderIndex,
          exerciseName: item.exerciseName,
          normalizedName: item.normalizedName,
        })),
      },
    },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  revalidatePath("/dashboard");
  return {
    ok: true,
    template: {
      id: template.id,
      name: template.name,
      isArchived: template.isArchived,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      items: template.items.map((i) => ({
        id: i.id,
        orderIndex: i.orderIndex,
        exerciseName: i.exerciseName,
        normalizedName: i.normalizedName,
      })),
    },
  };
}

export type UpdateTemplateResult =
  | { ok: true; template: TemplateWithItems }
  | { ok: false; errors: TemplateFormErrors };

/** Update template name and/or items. Trainer-only. */
export async function updateTemplate(
  id: string,
  data: { name?: unknown; items?: unknown }
): Promise<UpdateTemplateResult> {
  try {
    await requireTrainer();
  } catch {
    return { ok: false, errors: { _: "Forbidden" } };
  }
  const validated = validateTemplateUpdate(data);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const existing = await prisma.workoutTemplate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { ok: false, errors: { _: "Template not found" } };
  const updateData: { name?: string; items?: { deleteMany: {}; create: { orderIndex: number; exerciseName: string; normalizedName: string }[] } } = {};
  if (validated.data.name !== undefined) updateData.name = validated.data.name;
  if (validated.data.items !== undefined && validated.data.items.length > 0) {
    updateData.items = {
      deleteMany: {},
      create: validated.data.items.map((item) => ({
        orderIndex: item.orderIndex,
        exerciseName: item.exerciseName,
        normalizedName: item.normalizedName,
      })),
    };
  }
  const template = await prisma.workoutTemplate.update({
    where: { id },
    data: updateData,
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  revalidatePath("/dashboard");
  return {
    ok: true,
    template: {
      id: template.id,
      name: template.name,
      isArchived: template.isArchived,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      items: template.items.map((i) => ({
        id: i.id,
        orderIndex: i.orderIndex,
        exerciseName: i.exerciseName,
        normalizedName: i.normalizedName,
      })),
    },
  };
}

export type ArchiveTemplateResult = { ok: true } | { ok: false; error: string };

/** Archive a template (soft delete). Trainer-only. */
export async function archiveTemplate(id: string): Promise<ArchiveTemplateResult> {
  try {
    await requireTrainer();
  } catch {
    return { ok: false, error: "Forbidden" };
  }
  const existing = await prisma.workoutTemplate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Template not found" };
  await prisma.workoutTemplate.update({
    where: { id },
    data: { isArchived: true },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

export type RestoreTemplateResult = { ok: true } | { ok: false; error: string };

/** Restore an archived template. Trainer-only. */
export async function restoreTemplate(id: string): Promise<RestoreTemplateResult> {
  try {
    await requireTrainer();
  } catch {
    return { ok: false, error: "Forbidden" };
  }
  const existing = await prisma.workoutTemplate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Template not found" };
  await prisma.workoutTemplate.update({
    where: { id },
    data: { isArchived: false },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Get a single template by id (for apply flow). Trainer-only. */
export async function getTemplate(
  id: string
): Promise<{ ok: true; template: TemplateWithItems } | { ok: false; error: string }> {
  try {
    await requireTrainer();
  } catch {
    return { ok: false, error: "Forbidden" };
  }
  const template = await prisma.workoutTemplate.findUnique({
    where: { id, isArchived: false },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  if (!template) return { ok: false, error: "Template not found" };
  return {
    ok: true,
    template: {
      id: template.id,
      name: template.name,
      isArchived: template.isArchived,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      items: template.items.map((i) => ({
        id: i.id,
        orderIndex: i.orderIndex,
        exerciseName: i.exerciseName,
        normalizedName: i.normalizedName,
      })),
    },
  };
}
