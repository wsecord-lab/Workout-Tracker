import { prisma } from "@/lib/db";

const DEFAULT_TAKE = 20;
const MAX_TAKE = 100;
const CHART_SESSIONS_LIMIT = 50;
const CHART_WEIGHT_DAYS = 365;

export type SessionWithExercisesAndSets = Awaited<
  ReturnType<typeof getClientSessionsPaginated>
>["sessions"][number];

export async function getClientSessionsPaginated(params: {
  clientId: string;
  take?: number;
}) {
  const take = Math.min(params.take ?? DEFAULT_TAKE, MAX_TAKE);

  const sessions = await prisma.workoutSession.findMany({
    where: { clientId: params.clientId },
    orderBy: { date: "desc" },
    take: take + 1,
    include: {
      exercises: {
        where: { deletedAt: null },
        include: { sets: true },
      },
    },
  });

  const hasMore = sessions.length > take;
  const result = hasMore ? sessions.slice(0, take) : sessions;

  return { sessions: result, hasMore };
}

/** Last N sessions for progress/charts. Bounded to avoid loading full history. */
export async function getClientSessionsForCharts(clientId: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CHART_WEIGHT_DAYS);

  const sessions = await prisma.workoutSession.findMany({
    where: { clientId, date: { gte: cutoff } },
    orderBy: { date: "desc" },
    take: CHART_SESSIONS_LIMIT,
    include: {
      exercises: {
        where: { deletedAt: null },
        include: { sets: true },
      },
    },
  });

  return sessions;
}

/** Weight records for body weight chart. Bounded to last N days. */
export async function getClientWeightRecordsForChart(clientId: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CHART_WEIGHT_DAYS);

  return prisma.clientWeightRecord.findMany({
    where: { clientId, recordedAt: { gte: cutoff } },
    orderBy: { recordedAt: "asc" },
  });
}

/** Sessions for a client within a calendar month (start inclusive, end exclusive). */
export async function getClientSessionsInMonth(params: {
  clientId: string;
  year: number;
  month: number; // 1–12
}) {
  const monthStart = new Date(params.year, params.month - 1, 1);
  const monthEnd = new Date(params.year, params.month, 1);

  return prisma.workoutSession.findMany({
    where: {
      clientId: params.clientId,
      date: { gte: monthStart, lt: monthEnd },
    },
    orderBy: { date: "asc" },
    include: {
      exercises: {
        where: { deletedAt: null },
        include: { sets: true },
      },
    },
  });
}
