import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  getClientSessionsForCharts,
  getClientWeightRecordsForChart,
} from "@/lib/db/workouts";
import { getProgressByExercise } from "@/lib/progress";
import { requireUser, getClientIdForCurrentUser } from "@/lib/authz";
import { BodyWeightChart, ExerciseWeightChart } from "@/app/clients/[id]/WeightCharts";
import { ProgressTables } from "@/app/clients/[id]/ProgressTables";
import { ChartsClientSelector } from "@/app/charts/ChartsClientSelector";
import { ChartsHeader } from "@/app/charts/ChartsHeader";

export default async function ChartsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const user = await requireUser();
  const { clientId: queryClientId } = await searchParams;
  const isTrainer = user.role === "TRAINER";

  let clientId: string | null;
  let clients: { id: string; name: string }[] = [];

  if (isTrainer) {
    clients = await prisma.client.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    clientId = queryClientId ?? clients[0]?.id ?? null;
  } else {
    clientId = await getClientIdForCurrentUser();
    if (!clientId) redirect("/");
  }

  if (!clientId) {
    return (
      <div className="p-6 space-y-6">
        <ChartsHeader fallbackHref="/dashboard" />
        <p className="text-muted">No clients yet. Add a client to view charts.</p>
      </div>
    );
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, bodyWeightKg: true },
  });
  if (!client) redirect(isTrainer ? "/charts" : "/");

  const [chartSessions, weightRecords] = await Promise.all([
    getClientSessionsForCharts(clientId),
    getClientWeightRecordsForChart(clientId),
  ]);
  const progress = getProgressByExercise(chartSessions);

  const hasCharts = weightRecords.length > 0 || progress.length > 0;

  const fallbackHref = isTrainer ? "/dashboard" : `/clients/${clientId}`;

  return (
    <div className="p-6 space-y-6">
      <ChartsHeader fallbackHref={fallbackHref} />

      {isTrainer && (
        <Suspense fallback={<div className="mb-6 h-10" />}>
          <ChartsClientSelector
            clients={clients}
            currentClientId={clientId}
          />
        </Suspense>
      )}

      {!hasCharts ? (
        <p className="text-muted">No chart data yet for {client.name}. Add sessions and weight records to see analytics.</p>
      ) : (
        <>
          {!isTrainer && (
            <p className="text-sm text-muted">Charts for {client.name}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="min-w-0 overflow-hidden">
              <BodyWeightChart
                records={weightRecords}
                currentWeightKg={client.bodyWeightKg}
              />
            </div>
            <div className="min-w-0 overflow-hidden">
              <ExerciseWeightChart progress={progress} />
            </div>
          </div>
          {progress.length > 0 && (
            <div className="min-w-0 overflow-hidden">
              <h2 className="mb-4 text-xl font-bold text-[var(--text)]">Progress by exercise</h2>
              <ProgressTables progress={progress} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
