import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, getClientIdForCurrentUser } from "@/lib/authz";
import { ClientSearch } from "@/components/ClientSearch";

export default async function HomePage() {
  const user = await requireUser();
  const clientId = await getClientIdForCurrentUser();
  if (user.role === "CLIENT") {
    if (clientId) redirect(`/clients/${clientId}`);
    return (
      <div>
        <p className="text-muted">
          Your account is not linked to a client profile yet. Contact your trainer to get linked.
        </p>
      </div>
    );
  }

  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">Clients</h1>
        <Link
          href="/clients/new"
          className="btn-primary text-sm"
        >
          Add Client
        </Link>
      </div>
      <div className="mx-auto max-w-2xl">
        <ClientSearch
          clients={clients.map((c) => ({ id: c.id, name: c.name, email: null }))}
          basePath="/clients"
        />
      </div>
    </div>
  );
}
