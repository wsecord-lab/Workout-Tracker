"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

type ClientOption = { id: string; name: string };

type Props = {
  clients: ClientOption[];
};

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ExportToExcelCard({ clients }: Props) {
  const { data: session, status } = useSession();
  const isTrainer = status === "authenticated" && (session?.user as { role?: string })?.role === "TRAINER";

  const [includeClients, setIncludeClients] = useState(true);
  const [includeSessions, setIncludeSessions] = useState(true);
  const [includeSets, setIncludeSets] = useState(true);
  const [clientId, setClientId] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!isTrainer) return null;

  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
    setError(null);
  }

  function handleExport() {
    setError(null);
    if (!includeClients && !includeSessions && !includeSets) {
      setError("Select at least one sheet to include (Clients, Sessions, or Sets).");
      return;
    }
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    if (start && end && start > end) {
      setError("Start date must be before or equal to end date.");
      return;
    }

    const params = new URLSearchParams();
    params.set("includeClients", includeClients ? "1" : "0");
    params.set("includeSessions", includeSessions ? "1" : "0");
    params.set("includeSets", includeSets ? "1" : "0");
    params.set("clientId", clientId);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    const url = `/api/export/excel?${params.toString()}`;
    window.location.href = url;
  }

  return (
    <section className="card max-w-lg">
      <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Export to Excel</h2>

      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-[var(--text)]">Include sheets</p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeClients}
                onChange={(e) => setIncludeClients(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm text-[var(--text)]">Clients</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSessions}
                onChange={(e) => setIncludeSessions(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm text-[var(--text)]">Sessions</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSets}
                onChange={(e) => setIncludeSets(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm text-[var(--text)]">Sets</span>
            </label>
          </div>
        </div>

        <div>
          <label htmlFor="export-client" className="mb-1 block text-sm font-medium text-[var(--text)]">
            Client
          </label>
          <select
            id="export-client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="input mt-1"
          >
            <option value="all">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <label htmlFor="export-start" className="mb-1 block text-sm font-medium text-[var(--text)]">
              Start date
            </label>
            <input
              id="export-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input mt-1"
            />
          </div>
          <div>
            <label htmlFor="export-end" className="mb-1 block text-sm font-medium text-[var(--text)]">
              End date
            </label>
            <input
              id="export-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input mt-1"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted">Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset(7)}
            className="text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
          >
            Last 7 days
          </button>
          <span className="text-muted">·</span>
          <button
            type="button"
            onClick={() => applyPreset(30)}
            className="text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
          >
            Last 30 days
          </button>
          <span className="text-muted">·</span>
          <button
            type="button"
            onClick={() => applyPreset(90)}
            className="text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
          >
            Last 90 days
          </button>
        </div>

        {error && (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleExport}
          className="btn-primary"
        >
          Export to Excel
        </button>
      </div>
    </section>
  );
}
