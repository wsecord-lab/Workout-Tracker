import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getClientSessionsPaginated } from "@/lib/db/workouts";
import { formatHeight, formatWeight } from "@/lib/units";
import { createSession } from "@/app/actions/sessions";
import { listExerciseCatalog } from "@/app/actions/exercises";
import { requireUser, assertClientAccess } from "@/lib/authz";
import { LogoutButton } from "@/components/LogoutButton";
import { AddSessionButton } from "@/app/clients/[id]/AddSessionButton";
import { AddBiometricsButton } from "@/app/clients/[id]/AddBiometricsButton";
import { SessionBlock } from "@/app/clients/[id]/SessionBlock";
import { LoadMoreSessions } from "@/app/clients/[id]/LoadMoreSessions";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ take?: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await assertClientAccess(id);
  const isClient = user.role === "CLIENT";

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

  const [{ sessions, hasMore }, catalog] = await Promise.all([
    getClientSessionsPaginated({ clientId: id, take }),
    listExerciseCatalog(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className={`flex flex-1 min-w-0 items-center gap-4`}>
          {!isClient && (
            <Link
              href="/"
              className="text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded shrink-0"
            >
              ← Clients
            </Link>
          )}
          <h1 className="text-2xl font-bold text-[var(--text)] shrink-0">{client.name}</h1>
          <div className="flex items-center gap-3">
            <Link
              href={isClient ? "/charts" : `/charts?clientId=${id}`}
              className="btn-primary text-sm"
            >
              View Charts
            </Link>
            <Link
              href={`/clients/${id}/calendar`}
              className="btn-primary text-sm"
            >
              Calendar
            </Link>
          </div>
        </div>
        {!isClient && (
          <div className="shrink-0 flex items-center gap-3">
            <Link
              href={`/clients/${id}/edit`}
              className="btn-primary text-sm"
            >
              Manage This Account
            </Link>
          </div>
        )}
        {isClient && (
          <div className="shrink-0 ml-4 flex items-center gap-3">
            <Link
              href={`/clients/${id}/edit`}
              className="btn-primary text-sm"
            >
              Manage Account
            </Link>
            <LogoutButton variant="primary" />
          </div>
        )}
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
              <SessionBlock key={session.id} session={session} catalog={catalog} />
            ))}
            <LoadMoreSessions
              clientId={id}
              hasMore={hasMore}
              currentTake={take}
            />
          </>
        )}
      </div>
    </div>
  );
}
