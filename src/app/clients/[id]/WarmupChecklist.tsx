"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addWarmupItems,
  deleteWarmupItem,
  setWarmupItemDone,
  updateWarmupItem,
} from "@/app/actions/session-warmup";

export type SessionWarmupItem = {
  id: string;
  text: string;
  doneAt: Date | string | null;
  orderIndex: number;
};

/**
 * A session's own warmup checklist. Lives above the exercises and is never a
 * set, so nothing here counts toward volume, PRs or the "sets done" tally.
 *
 * `variant="workout"` is the at-the-gym view: big tap targets, collapses itself
 * once everything is checked off.
 */
export function WarmupChecklist({
  sessionId,
  items,
  variant = "editor",
}: {
  sessionId: string;
  items: SessionWarmupItem[];
  variant?: "editor" | "workout";
}) {
  const router = useRouter();
  const [live, setLive] = useState(items);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => { setLive(items); }, [items]);

  const sorted = [...live].sort((a, b) => a.orderIndex - b.orderIndex);
  const doneCount = sorted.filter((i) => i.doneAt != null).length;
  const allDone = sorted.length > 0 && doneCount === sorted.length;
  const [collapsed, setCollapsed] = useState(variant === "workout" && allDone);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        setLive(items); // undo the optimistic change
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  function toggle(item: SessionWarmupItem) {
    const done = item.doneAt == null;
    const next = live.map((i) => (i.id === item.id ? { ...i, doneAt: done ? new Date() : null } : i));
    setLive(next);
    if (variant === "workout" && done && next.every((i) => i.doneAt != null)) setCollapsed(true);
    run(() => setWarmupItemDone(item.id, done));
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    run(() => addWarmupItems(sessionId, draft), () => { setDraft(""); setAdding(variant === "editor"); });
  }

  function saveEdit(id: string) {
    setLive((prev) => prev.map((i) => (i.id === id ? { ...i, text: editText } : i)));
    run(() => updateWarmupItem(id, editText), () => setEditingId(null));
  }

  function remove(id: string) {
    setLive((prev) => prev.filter((i) => i.id !== id));
    run(() => deleteWarmupItem(id));
  }

  const isWorkout = variant === "workout";

  // Nothing planned and we're mid-workout: offer a single small "add" link.
  if (sorted.length === 0 && !adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className={`btn-secondary gap-1.5 ${isWorkout ? "text-xs py-1 px-2" : "text-sm py-1.5 px-3"}`}
      >
        <span aria-hidden="true">🔥</span> Add Warmup
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-50/40 dark:bg-amber-900/10 p-3 sm:p-4">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-2 text-left outline-none focus:ring-2 focus:ring-primary rounded"
        aria-expanded={!collapsed}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          🔥 Warmup {allDone && "✓"}
        </span>
        <span className="text-xs text-muted">
          {sorted.length > 0 && `${doneCount}/${sorted.length}`} {collapsed ? "▸" : "▾"}
        </span>
      </button>

      {!collapsed && (
        <div className="mt-2 space-y-1.5">
          {sorted.length > 0 && (
            <ul className="space-y-1.5">
              {sorted.map((item) => {
                const done = item.doneAt != null;
                if (editingId === item.id) {
                  return (
                    <li key={item.id} className="flex items-center gap-2">
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveEdit(item.id); }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="input flex-1 px-2 py-1.5 text-sm"
                        aria-label="Warmup item"
                        autoFocus
                        disabled={isPending}
                      />
                      <button type="button" onClick={() => saveEdit(item.id)} disabled={isPending}
                        className="rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50">
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} disabled={isPending}
                        className="btn-secondary text-xs py-1.5 px-2.5">
                        Cancel
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={item.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggle(item)}
                      aria-pressed={done}
                      aria-label={done ? `Mark "${item.text}" not done` : `Mark "${item.text}" done`}
                      className={`flex shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors outline-none focus:ring-2 focus:ring-primary ${
                        isWorkout ? "h-6 w-6" : "h-5 w-5"
                      } ${done ? "border-green-500 bg-green-500 text-white" : "border-amber-500/60 hover:border-primary"}`}
                    >
                      {done ? "✓" : ""}
                    </button>
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={() => toggle(item)}
                      className={`min-w-0 flex-1 cursor-pointer break-words text-sm ${
                        done ? "text-muted line-through" : "text-[var(--text)]"
                      }`}
                    >
                      {item.text}
                    </span>
                    {!isWorkout && (
                      <>
                        <button
                          type="button"
                          onClick={() => { setEditingId(item.id); setEditText(item.text); }}
                          className="shrink-0 rounded p-1 text-muted hover:text-[var(--text)]"
                          aria-label={`Edit "${item.text}"`}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(item.id)}
                          disabled={isPending}
                          className="shrink-0 rounded p-1 text-error/50 hover:text-error disabled:opacity-50"
                          aria-label={`Remove "${item.text}"`}
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {adding ? (
            <form onSubmit={add} className="flex flex-col gap-2 pt-1">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter adds; Shift+Enter (or pasting) gives multiple lines.
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(e); }
                }}
                rows={draft.includes("\n") ? 4 : 1}
                placeholder="e.g. Incline walk 3 min (paste a list to add several)"
                className="input w-full resize-y px-2 py-1.5 text-sm"
                aria-label="New warmup item"
                autoFocus
                disabled={isPending}
              />
              <div className="flex gap-2">
                <button type="submit" disabled={isPending || !draft.trim()}
                  className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50">
                  {isPending ? "…" : "Add"}
                </button>
                <button type="button" onClick={() => { setAdding(false); setDraft(""); setError(null); }}
                  disabled={isPending} className="btn-secondary text-xs py-1.5 px-3">
                  Done
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-xs text-primary hover:underline outline-none focus:ring-1 focus:ring-primary rounded"
            >
              + Add warmup item
            </button>
          )}
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
