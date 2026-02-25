import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatHeight, formatWeight } from "@/lib/units";

export default async function HomePage() {
  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" },
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
      <ul className="divide-y divide-border rounded border border-border bg-surface">
        {clients.length === 0 ? (
          <li className="px-4 py-8 text-center text-muted">No clients yet.</li>
        ) : (
          clients.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3">
              <Link
                href={`/clients/${c.id}`}
                className="font-medium text-primary outline-none hover:text-primary-hover hover:underline focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
              >
                {c.name}
              </Link>
              <span className="text-sm text-muted">
                {c.age}y · {formatHeight(c.heightCm)} · {formatWeight(c.bodyWeightKg)}
              </span>
              <div className="flex gap-2">
                <Link
                  href={`/clients/${c.id}/edit`}
                  className="text-sm text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                >
                  Edit
                </Link>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
