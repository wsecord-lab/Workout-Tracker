"use server";

import { prisma } from "@/lib/db";
import { assertClientAccess, requireTrainer } from "@/lib/authz";
import { parseCalendarDateKeyToUtcMidnight } from "@/lib/calendar-date";
import { revalidateClientWorkoutViews } from "@/lib/revalidate-client";
import { sanitizeNotes, NOTES_MAX_LENGTH } from "@/lib/sanitize";

export type RestDayActionResult = { ok: true } | { ok: false; error: string };

export async function markRestDay(
  clientId: string,
  dateKey: string,
  notes?: string | null
): Promise<RestDayActionResult> {
  await requireTrainer();
  await assertClientAccess(clientId);
  const date = parseCalendarDateKeyToUtcMidnight(dateKey);
  if (!date) return { ok: false, error: "Invalid date" };
  const sanitized =
    notes != null && String(notes).trim() !== ""
      ? sanitizeNotes(notes, NOTES_MAX_LENGTH)
      : null;
  await prisma.clientRestDay.upsert({
    where: { clientId_date: { clientId, date } },
    create: { clientId, date, notes: sanitized },
    update: { notes: sanitized },
  });
  revalidateClientWorkoutViews(clientId);
  return { ok: true };
}

export async function clearRestDay(clientId: string, dateKey: string): Promise<RestDayActionResult> {
  await requireTrainer();
  await assertClientAccess(clientId);
  const date = parseCalendarDateKeyToUtcMidnight(dateKey);
  if (!date) return { ok: false, error: "Invalid date" };
  await prisma.clientRestDay.deleteMany({
    where: { clientId, date },
  });
  revalidateClientWorkoutViews(clientId);
  return { ok: true };
}
