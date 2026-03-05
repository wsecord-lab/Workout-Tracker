import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTrainer } from "@/lib/authz";
import { ClientSearch } from "@/components/ClientSearch";

export default async function DashboardPage() {
  const user = await requireTrainer();

  const clients = await prisma.client.findMany({
    where: { trainerId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">Dashboard</h1>
        <Link href="/clients/new" className="btn-primary text-sm">
          Add Client
        </Link>
      </div>
      <ClientSearch
        clients={clients.map((c) => ({ id: c.id, name: c.name, email: null }))}
        basePath="/clients"
      />
    </div>
  );
}
