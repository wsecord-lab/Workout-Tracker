"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function ChartsClientSelector({
  clients,
  currentClientId,
}: {
  clients: { id: string; name: string }[];
  currentClientId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (clients.length === 0) return null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    const next = new URLSearchParams(searchParams.toString());
    if (id) next.set("clientId", id);
    else next.delete("clientId");
    router.push(`/charts?${next.toString()}`);
  }

  return (
    <div className="mb-6">
      <label htmlFor="charts-client" className="block text-sm font-medium text-[var(--text)] mb-1">
        Client
      </label>
      <select
        id="charts-client"
        value={currentClientId ?? ""}
        onChange={handleChange}
        className="input max-w-xs py-2"
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
