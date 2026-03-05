"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertClientAccess, requireTrainer } from "@/lib/authz";
import { invalidateClientMetricsCache } from "@/lib/metrics";
import { sanitizeName, sanitizeNotes, SESSION_NAME_MAX_LENGTH, NOTES_MAX_LENGTH } from "@/lib/sanitize";

/** Session name is sanitized (HTML stripped, max length enforced) before storage. */
export async function createSession(clientId: string, name?: string | null): Promise<void> {
  await assertClientAccess(clientId);
  const sanitized =
    name != null && name.trim() !== ""
      ? sanitizeName(name, SESSION_NAME_MAX_LENGTH)
      : undefined;
  await prisma.workoutSession.create({
    data: {
      clientId,
      name: sanitized || undefined,
    },
  });
  await invalidateClientMetricsCache(clientId);
  revalidatePath(`/clients/${clientId}`);
}

export type CreateSessionWithTemplateResult =
  | { ok: true }
  | { ok: false; error: string };

/** Create a session and optionally pre-populate exercises from a template. Trainer-only when templateId is provided. */
export async function createSessionWithTemplate(
  clientId: string,
  name?: string | null,
  templateId?: string | null
): Promise<CreateSessionWithTemplateResult> {
  await assertClientAccess(clientId);
  if (templateId) {
    await requireTrainer();
    const template = await prisma.workoutTemplate.findUnique({
      where: { id: templateId, isArchived: false },
      include: { items: { orderBy: { orderIndex: "asc" } } },
    });
    if (!template) return { ok: false, error: "Template not found" };
    const sanitized =
      name != null && name.trim() !== ""
        ? sanitizeName(name, SESSION_NAME_MAX_LENGTH)
        : undefined;
    const session = await prisma.workoutSession.create({
      data: {
        clientId,
        name: sanitized || undefined,
      },
    });
    await prisma.exercise.createMany({
      data: template.items.map((item, i) => ({
        sessionId: session.id,
        name: item.exerciseName,
        orderIndex: i,
      })),
    });
    await invalidateClientMetricsCache(clientId);
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  }
  await createSession(clientId, name);
  return { ok: true };
}

export type ApplyTemplateToSessionResult =
  | { ok: true }
  | { ok: false; error: string };

/** Apply a template to an existing session: replace or append exercises. Trainer-only. */
export async function applyTemplateToSession(
  sessionId: string,
  templateId: string,
  mode: "replace" | "append"
): Promise<ApplyTemplateToSessionResult> {
  await requireTrainer();
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    include: { exercises: true },
  });
  if (!session) return { ok: false, error: "Session not found" };
  await assertClientAccess(session.clientId);
  const template = await prisma.workoutTemplate.findUnique({
    where: { id: templateId, isArchived: false },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  if (!template) return { ok: false, error: "Template not found" };
  const baseIndex = mode === "replace" ? 0 : session.exercises.length;
  if (mode === "replace") {
    await prisma.exercise.updateMany({
      where: { sessionId },
      data: { deletedAt: new Date() },
    });
  }
  await prisma.exercise.createMany({
    data: template.items.map((item, i) => ({
      sessionId: session.id,
      name: item.exerciseName,
      orderIndex: baseIndex + i,
    })),
  });
  await invalidateClientMetricsCache(session.clientId);
  revalidatePath(`/clients/${session.clientId}`);
  return { ok: true };
}

/** Session name is sanitized (HTML stripped, max length enforced) before storage. */
export async function updateSessionName(sessionId: string, clientId: string, name: string | null): Promise<void> {
  await assertClientAccess(clientId);
  const sanitized =
    name != null && name.trim() !== ""
      ? sanitizeName(name, SESSION_NAME_MAX_LENGTH)
      : null;
  await prisma.workoutSession.update({
    where: { id: sessionId },
    data: { name: sanitized },
  });
  await invalidateClientMetricsCache(clientId);
  revalidatePath(`/clients/${clientId}`);
}

/** Session notes: sanitized (HTML stripped, max length) before storage. */
export async function updateSessionNotes(
  sessionId: string,
  clientId: string,
  notes: string | null
): Promise<void> {
  await assertClientAccess(clientId);
  const sanitized = sanitizeNotes(notes, NOTES_MAX_LENGTH);
  await prisma.workoutSession.update({
    where: { id: sessionId },
    data: { notes: sanitized },
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteSession(sessionId: string, clientId: string): Promise<void> {
  await assertClientAccess(clientId);
  await prisma.workoutSession.delete({
    where: { id: sessionId },
  });
  await invalidateClientMetricsCache(clientId);
  revalidatePath(`/clients/${clientId}`);
}
