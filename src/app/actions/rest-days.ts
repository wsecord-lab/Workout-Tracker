"use server";

import { prisma } from "@/lib/db";
import { assertClientAccess, requireTrainer } from "@/lib/authz";
import { revalidateClientWorkoutViews } from "@/lib/revalidate-client";
import { sanitizeNotes, NOTES_MAX_LENGTH } from "@/lib/sanitize";

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseCalendarDateKey(dateKey: string): Date | null {
  const m = dateKey.trim().match(DATE_KEY);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export type RestDayActionResult = { ok: true } | { ok: false; error: string };

export async function markRestDay(
  clientId: string,
  dateKey: string,
  notes?: string | null
): Promise<RestDayActionResult> {
  await requireTrainer();
  await assertClientAccess(clientId);
  const date = parseCalendarDateKey(dateKey);
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
  const date = parseCalendarDateKey(dateKey);
  if (!date) return { ok: false, error: "Invalid date" };
  await prisma.clientRestDay.deleteMany({
    where: { clientId, date },
  });
  revalidateClientWorkoutViews(clientId);
  return { ok: true };
}
