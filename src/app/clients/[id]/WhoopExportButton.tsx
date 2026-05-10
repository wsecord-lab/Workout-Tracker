"use client";

import { useState } from "react";

const WHOOP_CLIENTS = ["Will Secord", "Jack Secord"];

export function WhoopExportButton({
  sessionId,
  clientName,
}: {
  sessionId: string;
  clientName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!WHOOP_CLIENTS.includes(clientName)) return null;

  async function handleExport() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/export/whoop?sessionId=${sessionId}`);
      if (!res.ok) {
        setError("Export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      // filename comes from Content-Disposition but set a fallback
      a.download = `whoop-export.txt`;
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
        className="btn-secondary text-sm py-1.5 px-3 gap-1.5"
      >
        {loading ? "Preparing…" : "📋 Export for Whoop"}
      </button>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  );
}
