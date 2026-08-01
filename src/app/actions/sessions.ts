"use server";

import { prisma } from "@/lib/db";
import { assertClientAccess, requireTrainer } from "@/lib/authz";
import { invalidateClientMetricsCache } from "@/lib/metrics";
import { revalidateClientWorkoutViews } from "@/lib/revalidate-client";
import { parseCalendarDateKeyToLocalNoon } from "@/lib/calendar-date";
import { sanitizeName, sanitizeNotes, SESSION_NAME_MAX_LENGTH, NOTES_MAX_LENGTH } from "@/lib/sanitize";
import { normalizeSessionName } from "@/lib/session-name";
import { MAX_DURATION_MINUTES, MIN_DURATION_MINUTES } from "@/lib/session-duration";
import {
  findLastSessionWithSameName,
  getDurationStatsForName,
  listRecentDistinctSessionNames,
} from "@/lib/db/session-history";
import { COMPLETED_SET_WHERE } from "@/lib/sets";
import { randomBytes } from "crypto";

/** Session name is sanitized (HTML stripped, max length enforced) before storage. */
export async function createSession(
  clientId: string,
  name?: string | null,
  calendarDateKey?: string | null
): Promise<void> {
  await assertClientAccess(clientId);
  const sanitized =
    name != null && name.trim() !== ""
      ? sanitizeName(name, SESSION_NAME_MAX_LENGTH)
      : undefined;
  let sessionDate: Date | undefined;
  if (calendarDateKey != null && String(calendarDateKey).trim() !== "") {
    sessionDate = parseCalendarDateKeyToLocalNoon(String(calendarDateKey).trim()) ?? undefined;
  }
  await prisma.workoutSession.create({
    data: {
      clientId,
      name: sanitized || undefined,
      normalizedName: normalizeSessionName(sanitized),
      ...(sessionDate ? { date: sessionDate } : {}),
    },
  });
  await invalidateClientMetricsCache(clientId);
  revalidateClientWorkoutViews(clientId);
}

export type CreateSessionWithTemplateResult =
  | { ok: true }
  | { ok: false; error: string };

/** Create a session and optionally pre-populate exercises from a template. Trainer-only when templateId is provided. */
export async function createSessionWithTemplate(
  clientId: string,
  name?: string | null,
  templateId?: string | null,
  calendarDateKey?: string | null
): Promise<CreateSessionWithTemplateResult> {
  await assertClientAccess(clientId);
  let sessionDate: Date | undefined;
  if (calendarDateKey != null && String(calendarDateKey).trim() !== "") {
    sessionDate = parseCalendarDateKeyToLocalNoon(String(calendarDateKey).trim()) ?? undefined;
  }
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
        normalizedName: normalizeSessionName(sanitized),
        ...(sessionDate ? { date: sessionDate } : {}),
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
    revalidateClientWorkoutViews(clientId);
    return { ok: true };
  }
  await createSession(clientId, name, calendarDateKey);
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
  // Append after the highest live index. Using exercises.length would count
  // soft-deleted rows and leave gaps, and would collide once a soft-deleted
  // exercise is restored.
  const liveIndices = session.exercises
    .filter((e) => e.deletedAt == null)
    .map((e) => e.orderIndex);
  const baseIndex =
    mode === "replace" ? 0 : liveIndices.length > 0 ? Math.max(...liveIndices) + 1 : 0;
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
  revalidateClientWorkoutViews(session.clientId);
  return { ok: true };
}

type SourceExercise = {
  name: string;
  catalogExerciseId: string | null;
  groupId: string | null;
  sets: { weightKg: number; reps: number }[];
};

function newGroupId(): string {
  // Matches the format minted by /api/sessions/[sessionId]/groups.
  return `grp_${randomBytes(8).toString("hex")}`;
}

/**
 * Build the exercise + planned-set rows for copying a workout forward.
 * Group ids are re-minted (consistently, so a superset stays a superset) because
 * they're globally unique, not session-scoped.
 */
function buildCopyRows(source: SourceExercise[], baseIndex: number) {
  const groupIdMap = new Map<string, string>();
  return source.map((ex, i) => {
    let groupId: string | null = null;
    if (ex.groupId) {
      groupId = groupIdMap.get(ex.groupId) ?? newGroupId();
      groupIdMap.set(ex.groupId, groupId);
    }
    return {
      exercise: {
        name: ex.name,
        catalogExerciseId: ex.catalogExerciseId,
        groupId,
        orderIndex: baseIndex + i,
      },
      // Last time's numbers become this time's targets. RPE and notes are
      // deliberately dropped — a plan is a target, not last week's felt effort.
      sets: ex.sets.map((s, j) => ({
        weightKg: s.weightKg,
        reps: s.reps,
        plannedWeightKg: s.weightKg,
        plannedReps: s.reps,
        completedAt: null,
        orderIndex: j,
      })),
    };
  });
}

export type RepeatWorkoutResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: string };

/**
 * Create a session and pre-fill it from the last workout of the same name —
 * the template-less "do what I did last Upper Body" flow.
 *
 * Available to trainer and client alike (assertClientAccess, not requireTrainer).
 */
export async function repeatLastWorkout(
  clientId: string,
  opts: {
    name?: string | null;
    sourceSessionId?: string | null;
    calendarDateKey?: string | null;
  } = {}
): Promise<RepeatWorkoutResult> {
  await assertClientAccess(clientId);

  const sanitized =
    opts.name != null && opts.name.trim() !== ""
      ? sanitizeName(opts.name, SESSION_NAME_MAX_LENGTH)
      : undefined;

  const source = opts.sourceSessionId
    ? await prisma.workoutSession.findUnique({
        where: { id: opts.sourceSessionId },
        include: {
          exercises: {
            where: { deletedAt: null },
            orderBy: { orderIndex: "asc" },
            include: { sets: { where: COMPLETED_SET_WHERE, orderBy: { orderIndex: "asc" } } },
          },
        },
      })
    : sanitized
      ? await findLastSessionWithSameName({
          clientId,
          normalizedName: normalizeSessionName(sanitized)!,
        })
      : null;

  if (!source) return { ok: false, error: "No previous workout found to copy." };
  if (source.clientId !== clientId) return { ok: false, error: "No previous workout found to copy." };
  if (source.exercises.length === 0) return { ok: false, error: "That workout has nothing to copy." };

  // Fall back to the source's own name when creating straight from a picked session.
  const name = sanitized ?? source.name ?? undefined;

  let sessionDate: Date | undefined;
  if (opts.calendarDateKey != null && String(opts.calendarDateKey).trim() !== "") {
    sessionDate = parseCalendarDateKeyToLocalNoon(String(opts.calendarDateKey).trim()) ?? undefined;
  }

  const rows = buildCopyRows(source.exercises, 0);

  const created = await prisma.$transaction(async (tx) => {
    const session = await tx.workoutSession.create({
      data: {
        clientId,
        name,
        normalizedName: normalizeSessionName(name ?? null),
        ...(sessionDate ? { date: sessionDate } : {}),
      },
      select: { id: true },
    });
    for (const row of rows) {
      const exercise = await tx.exercise.create({
        data: { ...row.exercise, sessionId: session.id },
        select: { id: true },
      });
      if (row.sets.length > 0) {
        await tx.set.createMany({
          data: row.sets.map((s) => ({ ...s, exerciseId: exercise.id })),
        });
      }
    }
    return session;
  });

  await invalidateClientMetricsCache(clientId);
  revalidateClientWorkoutViews(clientId);
  return { ok: true, sessionId: created.id };
}

/**
 * Copy a previous workout into an existing session — the parallel to
 * applyTemplateToSession, but sourced from real history and carrying sets.
 */
export async function copyWorkoutIntoSession(
  targetSessionId: string,
  sourceSessionId: string,
  mode: "replace" | "append"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = await prisma.workoutSession.findUnique({
    where: { id: targetSessionId },
    include: { exercises: { where: { deletedAt: null }, select: { orderIndex: true } } },
  });
  if (!target) return { ok: false, error: "Session not found" };
  await assertClientAccess(target.clientId);

  const source = await prisma.workoutSession.findUnique({
    where: { id: sourceSessionId },
    include: {
      exercises: {
        where: { deletedAt: null },
        orderBy: { orderIndex: "asc" },
        include: { sets: { where: COMPLETED_SET_WHERE, orderBy: { orderIndex: "asc" } } },
      },
    },
  });
  if (!source || source.clientId !== target.clientId) {
    return { ok: false, error: "Workout not found" };
  }
  if (source.id === target.id) return { ok: false, error: "Cannot copy a workout into itself" };
  if (source.exercises.length === 0) return { ok: false, error: "That workout has nothing to copy." };

  const liveIndices = target.exercises.map((e) => e.orderIndex);
  const baseIndex =
    mode === "replace" ? 0 : liveIndices.length > 0 ? Math.max(...liveIndices) + 1 : 0;
  const rows = buildCopyRows(source.exercises, baseIndex);

  await prisma.$transaction(async (tx) => {
    if (mode === "replace") {
      await tx.exercise.updateMany({
        where: { sessionId: targetSessionId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    }
    for (const row of rows) {
      const exercise = await tx.exercise.create({
        data: { ...row.exercise, sessionId: targetSessionId },
        select: { id: true },
      });
      if (row.sets.length > 0) {
        await tx.set.createMany({
          data: row.sets.map((s) => ({ ...s, exerciseId: exercise.id })),
        });
      }
    }
  });

  await invalidateClientMetricsCache(target.clientId);
  revalidateClientWorkoutViews(target.clientId);
  return { ok: true };
}

export type RepeatableWorkoutOption = {
  sessionId: string;
  name: string;
  date: string;
  exerciseCount: number;
  completedSetCount: number;
  averageSeconds: number | null;
};

/** Options for the "copy last ___ workout" picker. Trainer and client alike. */
export async function listRepeatableWorkouts(
  clientId: string
): Promise<{ ok: true; options: RepeatableWorkoutOption[] } | { ok: false; error: string }> {
  await assertClientAccess(clientId);
  const workouts = await listRecentDistinctSessionNames({ clientId });
  return {
    ok: true,
    options: workouts.map((w) => ({
      sessionId: w.sessionId,
      name: w.name,
      date: w.date.toISOString(),
      exerciseCount: w.exerciseCount,
      completedSetCount: w.completedSetCount,
      averageSeconds: w.averageSeconds,
    })),
  };
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
    // Kept in lockstep with `name` — a stale normalizedName silently breaks
    // "copy last <name> workout" and the same-name duration average.
    data: { name: sanitized, normalizedName: normalizeSessionName(sanitized) },
  });
  await invalidateClientMetricsCache(clientId);
  revalidateClientWorkoutViews(clientId);
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
  revalidateClientWorkoutViews(clientId);
}

/**
 * Start the clock. Idempotent: re-entering workout mode after backgrounding the
 * app must not restart the timer, so startedAt is only written when unset.
 */
export async function startSession(
  sessionId: string,
  clientId: string
): Promise<{ ok: true; startedAt: string } | { ok: false; error: string }> {
  await assertClientAccess(clientId);
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    select: { startedAt: true, clientId: true },
  });
  if (!session || session.clientId !== clientId) return { ok: false, error: "Session not found" };
  if (session.startedAt) return { ok: true, startedAt: session.startedAt.toISOString() };

  const startedAt = new Date();
  await prisma.workoutSession.update({ where: { id: sessionId }, data: { startedAt } });
  revalidateClientWorkoutViews(clientId);
  return { ok: true, startedAt: startedAt.toISOString() };
}

export async function markSessionFinished(sessionId: string, clientId: string): Promise<void> {
  await assertClientAccess(clientId);
  // Deliberately does not backfill startedAt when it's null: a fabricated start
  // equal to the finish would render a confident, wrong "0 min". Better to show
  // "—" and let someone type the real number.
  await prisma.workoutSession.update({
    where: { id: sessionId },
    data: { finishedAt: new Date() },
  });
  await invalidateClientMetricsCache(clientId);
  revalidateClientWorkoutViews(clientId);
}

/**
 * Override the workout duration, or clear the override with `minutes = null`.
 * Available to trainer and client (assertClientAccess covers both).
 */
export async function updateSessionDuration(
  sessionId: string,
  clientId: string,
  minutes: number | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertClientAccess(clientId);
  if (minutes != null) {
    if (!Number.isInteger(minutes) || minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) {
      return { ok: false, error: `Enter a whole number of minutes (${MIN_DURATION_MINUTES}–${MAX_DURATION_MINUTES}).` };
    }
  }
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    select: { clientId: true },
  });
  if (!session || session.clientId !== clientId) return { ok: false, error: "Session not found" };

  await prisma.workoutSession.update({
    where: { id: sessionId },
    data: { durationSeconds: minutes == null ? null : minutes * 60 },
  });
  revalidateClientWorkoutViews(clientId);
  return { ok: true };
}

/**
 * Average duration of past workouts sharing this session's name, for pacing
 * inside workout mode. Fetched lazily on open rather than for every session in
 * the list — it's one extra query per started workout, not per row rendered.
 */
export async function getSessionDurationEstimate(
  sessionId: string,
  clientId: string
): Promise<{ averageSeconds: number | null; sampleCount: number }> {
  await assertClientAccess(clientId);
  const session = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    select: { clientId: true, normalizedName: true },
  });
  if (!session || session.clientId !== clientId || !session.normalizedName) {
    return { averageSeconds: null, sampleCount: 0 };
  }
  return getDurationStatsForName({ clientId, normalizedName: session.normalizedName });
}

export async function deleteSession(sessionId: string, clientId: string): Promise<void> {
  await assertClientAccess(clientId);
  await prisma.workoutSession.delete({
    where: { id: sessionId },
  });
  await invalidateClientMetricsCache(clientId);
  revalidateClientWorkoutViews(clientId);
}
