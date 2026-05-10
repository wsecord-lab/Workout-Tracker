"use client";

import { useState, useTransition, useEffect } from "react";
import { assignWarmupToSession } from "@/app/actions/warmup";
import { listWarmupBlocks } from "@/app/actions/warmup";

type WarmupItem = { id: string; name: string; details: string | null; orderIndex: number };
type WarmupBlock = { id: string; name: string; items: WarmupItem[] };

type AssignedBlock = {
  id: string;
  name: string;
  items: WarmupItem[];
};

// ─── Warmup display (both trainer and client see this) ────────────────────────

export function WarmupDisplay({ block }: { block: AssignedBlock }) {
  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-50/40 dark:bg-amber-900/10 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
        Warmup — {block.name}
      </p>
      <ol className="space-y-1">
        {block.items.map((item, i) => (
          <li key={item.id} className="flex gap-2 text-sm">
            <span className="shrink-0 text-muted">{i + 1}.</span>
            <span className="text-[var(--text)]">
              {item.name}
              {item.details && (
                <span className="ml-1 text-muted">— {item.details}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Assignment control (trainer only) ───────────────────────────────────────

export function WarmupAssigner({
  sessionId,
  currentBlock,
  onChanged,
}: {
  sessionId: string;
  currentBlock: AssignedBlock | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<WarmupBlock[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    listWarmupBlocks().then((b) => setBlocks(b as WarmupBlock[]));
  }, [open]);

  function assign(blockId: string | null) {
    startTransition(async () => {
      await assignWarmupToSession(sessionId, blockId);
      setOpen(false);
      onChanged();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary text-sm py-1.5 px-3 gap-1.5"
      >
        🏃 {currentBlock ? `Warmup: ${currentBlock.name}` : "Assign Warmup"}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
      <p className="text-sm font-medium text-[var(--text)]">Assign Warmup Block</p>
      {blocks.length === 0 ? (
        <p className="text-xs text-muted">
          No warmup blocks yet.{" "}
          <a href="/dashboard/warmups" className="text-primary hover:underline">
            Create one →
          </a>
        </p>
      ) : (
        <div className="space-y-1">
          {blocks.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => assign(b.id)}
              disabled={isPending}
              className={`w-full text-left rounded px-3 py-2 text-sm hover:bg-muted/20 outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 ${
                b.id === currentBlock?.id ? "font-semibold text-primary" : "text-[var(--text)]"
              }`}
            >
              {b.name}
              {b.id === currentBlock?.id && " ✓"}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 pt-1 border-t border-border">
        {currentBlock && (
          <button
            type="button"
            onClick={() => assign(null)}
            disabled={isPending}
            className="text-xs text-error/70 hover:text-error hover:underline outline-none focus:ring-1 focus:ring-error rounded disabled:opacity-50"
          >
            Remove warmup
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="ml-auto text-xs text-muted hover:text-[var(--text)] outline-none focus:ring-1 focus:ring-primary rounded"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
