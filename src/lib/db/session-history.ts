import { prisma } from "@/lib/db";
import { COMPLETED_SET_WHERE } from "@/lib/sets";
import { getSessionDurationSeconds } from "@/lib/session-duration";

const DURATION_SAMPLE_LIMIT = 10;
const RECENT_NAMES_LIMIT = 10;
const RECENT_NAMES_SCAN = 60;

/**
 * The most recent session for this client with the same normalized name,
 * with everything needed to copy it forward as a plan.
 *
 * Only completed sets come back: repeating a workout should target what was
 * actually lifted last time, not sets that were planned and skipped.
 */
export async function findLastSessionWithSameName(params: {
  clientId: string;
  normalizedName: string;
  beforeDate?: Date;
  excludeSessionId?: string;
}) {
  return prisma.workoutSession.findFirst({
    where: {
      clientId: params.clientId,
      normalizedName: params.normalizedName,
      ...(params.beforeDate ? { date: { lt: params.beforeDate } } : {}),
      ...(params.excludeSessionId ? { id: { not: params.excludeSessionId } } : {}),
    },
    orderBy: { date: "desc" },
    include: {
      exercises: {
        where: { deletedAt: null },
        orderBy: { orderIndex: "asc" },
        include: { sets: { where: COMPLETED_SET_WHERE, orderBy: { orderIndex: "asc" } } },
      },
    },
  });
}

/** Average duration across recent sessions of the same name — the estimate. */
export async function getDurationStatsForName(params: {
  clientId: string;
  normalizedName: string;
  limit?: number;
}): Promise<{ sampleCount: number; averageSeconds: number | null }> {
  const sessions = await prisma.workoutSession.findMany({
    where: { clientId: params.clientId, normalizedName: params.normalizedName },
    orderBy: { date: "desc" },
    take: params.limit ?? DURATION_SAMPLE_LIMIT,
    select: { startedAt: true, finishedAt: true, durationSeconds: true },
  });

  const durations = sessions
    .map(getSessionDurationSeconds)
    .filter((d): d is number => d != null);

  if (durations.length === 0) return { sampleCount: 0, averageSeconds: null };
  const total = durations.reduce((sum, d) => sum + d, 0);
  return {
    sampleCount: durations.length,
    averageSeconds: Math.round(total / durations.length),
  };
}

export type RepeatableWorkout = {
  sessionId: string;
  name: string;
  normalizedName: string;
  date: Date;
  exerciseCount: number;
  completedSetCount: number;
  averageSeconds: number | null;
};

/**
 * Distinct recent workout names for the "copy last ___ workout" picker, each
 * pointing at its most recent instance. Sessions with no exercises are skipped —
 * there'd be nothing to copy.
 */
export async function listRecentDistinctSessionNames(params: {
  clientId: string;
  limit?: number;
}): Promise<RepeatableWorkout[]> {
  const sessions = await prisma.workoutSession.findMany({
    where: { clientId: params.clientId, normalizedName: { not: null } },
    orderBy: { date: "desc" },
    take: RECENT_NAMES_SCAN,
    select: {
      id: true,
      name: true,
      normalizedName: true,
      date: true,
      startedAt: true,
      finishedAt: true,
      durationSeconds: true,
      exercises: {
        where: { deletedAt: null },
        select: { _count: { select: { sets: { where: COMPLETED_SET_WHERE } } } },
      },
    },
  });

  const byName = new Map<string, RepeatableWorkout>();
  const durationsByName = new Map<string, number[]>();

  for (const s of sessions) {
    const normalizedName = s.normalizedName!;
    const duration = getSessionDurationSeconds(s);
    if (duration != null) {
      durationsByName.set(normalizedName, [...(durationsByName.get(normalizedName) ?? []), duration]);
    }
    if (byName.has(normalizedName)) continue; // first hit is the most recent
    if (s.exercises.length === 0) continue;
    byName.set(normalizedName, {
      sessionId: s.id,
      name: s.name ?? normalizedName,
      normalizedName,
      date: s.date,
      exerciseCount: s.exercises.length,
      completedSetCount: s.exercises.reduce((sum, e) => sum + e._count.sets, 0),
      averageSeconds: null,
    });
  }

  return Array.from(byName.values())
    .slice(0, params.limit ?? RECENT_NAMES_LIMIT)
    .map((w) => {
      const samples = durationsByName.get(w.normalizedName) ?? [];
      return {
        ...w,
        averageSeconds:
          samples.length > 0
            ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
            : null,
      };
    });
}
