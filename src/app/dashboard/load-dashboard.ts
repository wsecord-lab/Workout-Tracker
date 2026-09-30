import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { startOfToday } from "@/components/dashboard/relative-time";
import type {
  InProgressSession,
  LastTrainedRow,
  RecentSession,
  UpcomingSession,
} from "@/components/dashboard/TrainerGlance";

const RECENT_LIMIT = 12;
const UPCOMING_LIMIT = 8;

function toIso(d: Date | null | undefined): string | null {
  return d == null ? null : d.toISOString();
}

export async function loadTrainerGlance(trainerId: string) {
  const now = new Date();
  const todayStart = startOfToday(now);

  const [clients, inProgressRows, upcomingRows, recentRows] = await Promise.all([
    prisma.client.findMany({
      where: { trainerId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.workoutSession.findMany({
      where: {
        startedAt: { not: null },
        finishedAt: null,
        client: { trainerId },
      },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        name: true,
        startedAt: true,
        pausedAt: true,
        totalPausedSeconds: true,
        date: true,
        client: { select: { id: true, name: true } },
      },
    }),
    prisma.workoutSession.findMany({
      where: {
        startedAt: null,
        finishedAt: null,
        date: { gte: todayStart },
        client: { trainerId },
      },
      orderBy: { date: "asc" },
      take: UPCOMING_LIMIT,
      select: {
        id: true,
        name: true,
        date: true,
        client: { select: { id: true, name: true } },
      },
    }),
    prisma.workoutSession.findMany({
      where: {
        finishedAt: { not: null },
        client: { trainerId },
      },
      orderBy: { finishedAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        name: true,
        finishedAt: true,
        date: true,
        client: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Latest finished session per client (Postgres DISTINCT ON).
  const lastFinishedByClient = new Map<
    string,
    { finishedAt: Date; name: string | null }
  >();
  if (clients.length > 0) {
    const clientIds = clients.map((c) => c.id);
    const finished = await prisma.$queryRaw<
      Array<{ clientId: string; finishedAt: Date; name: string | null }>
    >(Prisma.sql`
      SELECT DISTINCT ON (ws."clientId")
        ws."clientId",
        ws."finishedAt",
        ws.name
      FROM "WorkoutSession" ws
      WHERE ws."finishedAt" IS NOT NULL
        AND ws."clientId" IN (${Prisma.join(clientIds)})
      ORDER BY ws."clientId", ws."finishedAt" DESC
    `);
    for (const row of finished) {
      lastFinishedByClient.set(row.clientId, {
        finishedAt: row.finishedAt,
        name: row.name,
      });
    }
  }

  const inProgress: InProgressSession[] = inProgressRows.map((s) => ({
    id: s.id,
    name: s.name,
    startedAt: toIso(s.startedAt)!,
    pausedAt: toIso(s.pausedAt),
    totalPausedSeconds: s.totalPausedSeconds,
    date: s.date.toISOString(),
    client: s.client,
  }));

  const upcoming: UpcomingSession[] = upcomingRows.map((s) => ({
    id: s.id,
    name: s.name,
    date: s.date.toISOString(),
    client: s.client,
  }));

  const recent: RecentSession[] = recentRows.map((s) => ({
    id: s.id,
    name: s.name,
    finishedAt: toIso(s.finishedAt)!,
    date: s.date.toISOString(),
    client: s.client,
  }));

  // Clients who never finished sort to the top ("Never"), then oldest last-trained first.
  const lastTrained: LastTrainedRow[] = clients
    .map((c) => {
      const last = lastFinishedByClient.get(c.id);
      return {
        client: c,
        lastFinishedAt: last ? last.finishedAt.toISOString() : null,
        lastSessionName: last?.name?.trim() || null,
      };
    })
    .sort((a, b) => {
      if (a.lastFinishedAt == null && b.lastFinishedAt == null) {
        return a.client.name.localeCompare(b.client.name);
      }
      if (a.lastFinishedAt == null) return -1;
      if (b.lastFinishedAt == null) return 1;
      return a.lastFinishedAt.localeCompare(b.lastFinishedAt);
    });

  return {
    clients,
    inProgress,
    upcoming,
    recent,
    lastTrained,
    nowIso: now.toISOString(),
  };
}
