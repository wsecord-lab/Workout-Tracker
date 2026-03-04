"use client";

/**
 * Client search UI for trainer dashboard.
 *
 * Usage in /dashboard (or any page that has clients):
 *   <ClientSearch clients={clients} />
 *
 * With custom base path:
 *   <ClientSearch clients={clients} basePath="/trainer/clients" />
 */

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { filterClients } from "@/lib/client-search";

export type ClientSearchClient = {
  id: string;
  name: string;
  email?: string | null;
};

type Props = {
  clients: ClientSearchClient[];
  basePath?: string;
};

export function ClientSearch({ clients, basePath = "/clients" }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => filterClients(clients, query),
    [clients, query]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" || filtered.length === 0) return;
      e.preventDefault();
      const first = filtered[0];
      if (first) window.location.href = `${basePath}/${first.id}`;
    },
    [filtered, basePath]
  );

  return (
    <div className="rounded border border-border bg-surface p-4">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search clients…"
        aria-label="Search clients"
        className="input mb-3"
      />
      <p className="mb-2 text-sm text-muted">
        Showing {filtered.length} of {clients.length}
      </p>
      <ul className="divide-y divide-border rounded border border-border bg-background/50 overflow-hidden">
        {filtered.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-muted">
            No clients found.
          </li>
        ) : (
          filtered.map((client) => (
            <li key={client.id}>
              <Link
                href={`${basePath}/${client.id}`}
                className="flex flex-col gap-0.5 px-4 py-3 text-left outline-none transition-colors hover:bg-primary/10 focus:ring-2 focus:ring-primary focus:ring-inset"
              >
                <span className="font-medium text-[var(--text)]">
                  {client.name}
                </span>
                {client.email != null && client.email !== "" && (
                  <span className="text-sm text-muted">{client.email}</span>
                )}
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
