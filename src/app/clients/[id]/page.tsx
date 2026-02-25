import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  getClientSessionsPaginated,
  getClientSessionsForCharts,
  getClientWeightRecordsForChart,
} from "@/lib/db/workouts";
import { formatHeight, formatWeight } from "@/lib/units";
import { getProgressByExercise } from "@/lib/progress";
import { createSession } from "@/app/actions/sessions";
import { AddSessionButton } from "@/app/clients/[id]/AddSessionButton";
import { AddBiometricsButton } from "@/app/clients/[id]/AddBiometricsButton";
import { SessionBlock } from "@/app/clients/[id]/SessionBlock";
import { LoadMoreSessions } from "@/app/clients/[id]/LoadMoreSessions";
import { ProgressTables } from "@/app/clients/[id]/ProgressTables";
import { BodyWeightChart, ExerciseWeightChart } from "@/app/clients/[id]/WeightCharts";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ take?: string }>;
}) {
  const { id } = await params;
  const { take: takeParam } = await searchParams;
  const take = Math.min(
    Math.max(parseInt(takeParam ?? "20", 10) || 20, 20),
    100
  );

  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      age: true,
      heightCm: true,
      bodyWeightKg: true,
    },
  });
  if (!client) notFound();

  const [{ sessions, hasMore }, chartSessions, weightRecords] = await Promise.all([
    getClientSessionsPaginated({ clientId: id, take }),
    getClientSessionsForCharts(id),
    getClientWeightRecordsForChart(id),
  ]);

  const progress = getProgressByExercise(chartSessions);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
          >
            ← Clients
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text)]">{client.name}</h1>
          <div className="flex items-center gap-3">
            <a
              href="#progress-charts"
              className="text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
            >
              View charts
            </a>
            <Link
              href={`/clients/${id}/edit`}
              className="text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
            >
              Edit
            </Link>
          </div>
        </div>
      </div>
      <p className="mb-6 text-sm text-muted">
        {client.age}y · {formatHeight(client.heightCm)} ·{" "}
        {formatWeight(client.bodyWeightKg)}
      </p>
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <AddSessionButton clientId={id} createSession={createSession} />
        <AddBiometricsButton clientId={id} />
      </div>
      <div className="space-y-8">
        {sessions.length === 0 ? (
          <p className="text-muted">No sessions yet. Add a session to get started.</p>
        ) : (
          <>
            {sessions.map((session) => (
              <SessionBlock key={session.id} session={session} />
            ))}
            <LoadMoreSessions
              clientId={id}
              hasMore={hasMore}
              currentTake={take}
            />
          </>
        )}
      </div>
      {(weightRecords.length > 0 || progress.length > 0) && (
        <div
          id="progress-charts"
          className="mt-10 border-t border-border pt-8 scroll-mt-4"
        >
          <h2 className="mb-6 text-xl font-bold text-[var(--text)]">
            Progress charts
          </h2>
          <div className="mb-10 space-y-8">
            <BodyWeightChart
              records={weightRecords}
              currentWeightKg={client.bodyWeightKg}
            />
            <ExerciseWeightChart progress={progress} />
          </div>
          {progress.length > 0 && (
            <>
              <h2 className="mb-4 text-xl font-bold text-[var(--text)]">
                Progress by exercise
              </h2>
              <ProgressTables progress={progress} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
