import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getClientSessionsInMonth, getClientRestDaysInMonth } from "@/lib/db/workouts";
import { requireUser, assertClientAccess } from "@/lib/authz";
import { listExerciseCatalog } from "@/app/actions/exercises";
import { listTrainerExercisesForClient } from "@/app/actions/trainer-exercises";
import { CalendarClient } from "../CalendarClient";

export default async function ClientCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await assertClientAccess(id);
  const isTrainer = user.role === "TRAINER";

  const { year: yearParam, month: monthParam } = await searchParams;

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true, trainerId: true },
  });
  if (!client) notFound();

  const now = new Date();
  const year = Math.min(
    Math.max(parseInt(yearParam ?? String(now.getFullYear()), 10) || now.getFullYear(), 1),
    9999
  );
  const month = Math.min(
    Math.max(parseInt(monthParam ?? String(now.getMonth() + 1), 10) || now.getMonth() + 1, 1),
    12
  );

  const [sessions, restDays, catalog] = await Promise.all([
    getClientSessionsInMonth({ clientId: id, year, month }),
    getClientRestDaysInMonth({ clientId: id, year, month }),
    isTrainer
      ? client.trainerId
        ? listTrainerExercisesForClient(client.trainerId)
        : listExerciseCatalog()
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link
          href={`/clients/${id}`}
          className="text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
        >
          ← {client.name}
        </Link>
        <h1 className="text-2xl font-bold text-[var(--text)]">Calendar</h1>
      </div>
      <CalendarClient
        clientId={id}
        year={year}
        month={month}
        sessions={sessions}
        restDays={restDays}
        isTrainer={isTrainer}
        catalog={catalog}
        trainerId={client.trainerId}
      />
    </div>
  );
}
