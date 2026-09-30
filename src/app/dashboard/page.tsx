import Link from "next/link";
import { requireTrainer } from "@/lib/authz";
import { ClientSearch } from "@/components/ClientSearch";
import { TrainerGlance } from "@/components/dashboard/TrainerGlance";
import { loadTrainerGlance } from "./load-dashboard";

export default async function DashboardPage() {
  const user = await requireTrainer();
  const { clients, inProgress, upcoming, recent, lastTrained, nowIso } =
    await loadTrainerGlance(user.id);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            Today&apos;s work — who needs attention now.
          </p>
        </div>
        <Link href="/clients/new" className="btn-primary text-sm shrink-0">
          Add Client
        </Link>
      </div>

      <TrainerGlance
        inProgress={inProgress}
        upcoming={upcoming}
        recent={recent}
        lastTrained={lastTrained}
        nowIso={nowIso}
      />

      <section className="mt-2">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Find a client
        </h2>
        <ClientSearch
          clients={clients.map((c) => ({ id: c.id, name: c.name, email: null }))}
          basePath="/clients"
        />
      </section>
    </div>
  );
}
