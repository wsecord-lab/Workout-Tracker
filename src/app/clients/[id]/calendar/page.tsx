import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getClientSessionsInMonth } from "@/lib/db/workouts";
import { CalendarClient } from "../CalendarClient";

export default async function ClientCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { id } = await params;
  const { year: yearParam, month: monthParam } = await searchParams;

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true },
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

  const sessionsRaw = await getClientSessionsInMonth({ clientId: id, year, month });
  const sessions = sessionsRaw.map((s) => ({
    id: s.id,
    name: s.name,
    date: s.date.toISOString(),
    clientId: s.clientId,
    exercises: (s.exercises ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      sessionId: e.sessionId,
      catalogExerciseId: e.catalogExerciseId,
      sets: (e.sets ?? []).map((set) => ({
        id: set.id,
        weightKg: set.weightKg,
        reps: set.reps,
        rpe: set.rpe,
        notes: set.notes,
        exerciseId: set.exerciseId,
      })),
    })),
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/clients/${id}`}
            className="text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
          >
            ← {client.name}
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text)]">Calendar</h1>
        </div>
      </div>
      <CalendarClient
        clientId={id}
        clientName={client.name}
        year={year}
        month={month}
        sessions={sessions}
      />
    </div>
  );
}
