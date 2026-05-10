"use client";

import { useState } from "react";

export function WhoopExportButton({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({ clientId });
      const res = await fetch(`/api/export/whoop?${params.toString()}`);
      if (!res.ok) {
        setError("Export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `workout-log-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setError("Export failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={loading}
        className="btn-secondary text-sm"
      >
        {loading ? "Preparing…" : "Export for Whoop"}
      </button>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  );
}
