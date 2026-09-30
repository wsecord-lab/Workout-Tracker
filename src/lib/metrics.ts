import { prisma } from "@/lib/db";
import { COMPLETED_SET_WHERE } from "@/lib/sets";
import {
  type ClientMetricsPayload,
  type MetricsRangeKey,
  parseRange,
} from "@/lib/metrics-shared";

export type {
  ClientMetricsPayload,
  ExerciseMetrics,
  MetricsRangeKey,
} from "@/lib/metrics-shared";
export {
  METRICS_RANGE_KEYS,
  isMetricsRangeKey,
  parseRange,
  metricsRangeLabel,
  formatVolumeKgReps,
  findExerciseMetrics,
} from "@/lib/metrics-shared";

const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

function epley1RM(weightKg: number, reps: number): number {
  if (reps <= 0) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Shape aggregateMetrics needs — structural so tests don't have to mock Prisma. */
export type MetricsSession = {
  date: Date;
  exercises: Array<{
    name: string;
    sets: Array<{ weightKg: number; reps: number; completedAt: Date | null }>;
  }>;
};

/**
 * Pure aggregation over already-fetched sessions.
 *
 * Only completed sets contribute: a planned set carries its target in
 * weightKg/reps, and counting those would inflate volume with work nobody did.
 * The caller's query should already filter (COMPLETED_SET_WHERE); the guard here
 * is defence in depth, since this is the one place volume is computed.
 */
export function aggregateMetrics(sessions: MetricsSession[]): ClientMetricsPayload {
  let totalVolumeKgReps = 0;
  const byExercise = new Map<
    string,
    { bestE1RM: number; bestWeight: number; bestVolume: number; sessionDate: string }
  >();

  for (const session of sessions) {
    const sessionDate = session.date.toISOString().slice(0, 10);
    for (const ex of session.exercises) {
      for (const set of ex.sets) {
        if (set.completedAt == null) continue;
        const vol = set.weightKg * set.reps;
        totalVolumeKgReps += vol;
        const e1rm = epley1RM(set.weightKg, set.reps);
        const existing = byExercise.get(ex.name);
        if (!existing) {
          byExercise.set(ex.name, {
            bestE1RM: e1rm,
            bestWeight: set.weightKg,
            bestVolume: vol,
            sessionDate,
          });
        } else {
          if (e1rm > existing.bestE1RM) {
            existing.bestE1RM = e1rm;
            existing.bestWeight = set.weightKg;
            existing.sessionDate = sessionDate;
          }
          if (vol > existing.bestVolume) existing.bestVolume = vol;
        }
      }
    }
  }

  const exercises = Array.from(byExercise.entries()).map(([exerciseName, v]) => ({
    exerciseName,
    bestE1RMKg: Math.round(v.bestE1RM * 1e3) / 1e3,
    bestWeightKg: v.bestWeight,
    bestVolumeKgReps: v.bestVolume,
    sessionDate: v.sessionDate,
  }));

  return {
    totalVolumeKgReps,
    exercises,
    computedAt: new Date().toISOString(),
  };
}

export async function computeClientMetrics(
  clientId: string,
  rangeDays: number
): Promise<ClientMetricsPayload> {
  const since = new Date();
  since.setDate(since.getDate() - rangeDays);
  since.setHours(0, 0, 0, 0);

  const sessions = await prisma.workoutSession.findMany({
    where: { clientId, date: { gte: since } },
    orderBy: { date: "desc" },
    include: {
      exercises: {
        where: { deletedAt: null },
        include: { sets: { where: COMPLETED_SET_WHERE } },
      },
    },
  });

  return aggregateMetrics(sessions);
}

export async function getClientMetricsCached(
  clientId: string,
  rangeKey: string
): Promise<ClientMetricsPayload> {
  const rangeDays = parseRange(rangeKey);
  if (rangeDays == null) throw new Error("Invalid range");
  const key = rangeKey.toLowerCase() as MetricsRangeKey;

  const cached = await prisma.clientMetricsCache.findUnique({
    where: { clientId_rangeKey: { clientId, rangeKey: key } },
  });

  const now = Date.now();
  if (cached) {
    const age = now - cached.computedAt.getTime();
    if (age < CACHE_MAX_AGE_MS) {
      return JSON.parse(cached.payloadJson) as ClientMetricsPayload;
    }
  }

  const payload = await computeClientMetrics(clientId, rangeDays);
  await prisma.clientMetricsCache.upsert({
    where: { clientId_rangeKey: { clientId, rangeKey: key } },
    create: { clientId, rangeKey: key, payloadJson: JSON.stringify(payload) },
    update: { payloadJson: JSON.stringify(payload), computedAt: new Date() },
  });
  return payload;
}

export async function invalidateClientMetricsCache(clientId: string): Promise<void> {
  await prisma.clientMetricsCache.deleteMany({ where: { clientId } });
}
