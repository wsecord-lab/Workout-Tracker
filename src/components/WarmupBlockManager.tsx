"use client";

import { useState, useTransition } from "react";
import {
  createWarmupBlock,
  updateWarmupBlock,
  deleteWarmupBlock,
} from "@/app/actions/warmup";

type WarmupItem = { id: string; name: string; details: string | null; orderIndex: number };
type WarmupBlock = { id: string; name: string; items: WarmupItem[] };

type ItemDraft = { name: string; details: string };

function emptyItem(): ItemDraft {
  return { name: "", details: "" };
}

function BlockEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: WarmupBlock;
  onSave: (name: string, items: ItemDraft[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [items, setItems] = useState<ItemDraft[]>(
    initial?.items.map((i) => ({ name: i.name, details: i.details ?? "" })) ?? [emptyItem()]
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof ItemDraft, value: string) {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Block name is required."); return; }
    if (items.filter((i) => i.name.trim()).length === 0) {
      setError("Add at least one exercise."); return;
    }
    startTransition(async () => {
      await onSave(name.trim(), items);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[var(--text)] mb-1">Block Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Leg Warmup"
          className="input w-full py-1.5 text-sm"
          disabled={isPending}
          autoFocus
        />
      </div>

      <div>
        <p className="text-sm font-medium text-[var(--text)] mb-2">Exercises</p>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <div className="flex-1 min-w-0 space-y-1">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => updateItem(idx, "name", e.target.value)}
                  placeholder={`Exercise ${idx + 1} name`}
                  className="input w-full py-1 text-sm"
                  disabled={isPending}
                />
                <input
                  type="text"
                  value={item.details}
                  onChange={(e) => updateItem(idx, "details", e.target.value)}
                  placeholder="Sets / reps / duration (e.g. 2×10 each side)"
                  className="input w-full py-1 text-sm text-muted"
                  disabled={isPending}
                />
              </div>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                disabled={isPending}
                className="mt-1 shrink-0 text-error/60 hover:text-error text-lg leading-none outline-none focus:ring-1 focus:ring-error rounded"
                aria-label="Remove exercise"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addItem}
          disabled={isPending}
          className="mt-2 text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded"
        >
          + Add Exercise
        </button>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} disabled={isPending} className="btn-secondary text-sm py-1.5">
          Cancel
        </button>
        <button type="submit" disabled={isPending} className="btn-primary text-sm py-1.5">
          {isPending ? "Saving…" : initial ? "Save Changes" : "Create Block"}
        </button>
      </div>
    </form>
  );
}

export function WarmupBlockManager({ blocks: initialBlocks }: { blocks: WarmupBlock[] }) {
  const [blocks, setBlocks] = useState<WarmupBlock[]>(initialBlocks);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleCreate(name: string, items: ItemDraft[]) {
    const result = await createWarmupBlock(name, items);
    if (result.ok) {
      // Optimistically add to list
      const newBlock: WarmupBlock = {
        id: result.id,
        name,
        items: items
          .filter((i) => i.name.trim())
          .map((i, idx) => ({ id: `tmp-${idx}`, name: i.name, details: i.details || null, orderIndex: idx })),
      };
      setBlocks((prev) => [...prev, newBlock]);
      setCreating(false);
    }
  }

  async function handleUpdate(blockId: string, name: string, items: ItemDraft[]) {
    const result = await updateWarmupBlock(blockId, name, items);
    if (result.ok) {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId
            ? {
                ...b,
                name,
                items: items
                  .filter((i) => i.name.trim())
                  .map((i, idx) => ({ id: `tmp-${idx}`, name: i.name, details: i.details || null, orderIndex: idx })),
              }
            : b
        )
      );
      setEditingId(null);
    }
  }

  function handleDelete(blockId: string) {
    setDeletingId(blockId);
    startTransition(async () => {
      await deleteWarmupBlock(blockId);
      setBlocks((prev) => prev.filter((b) => b.id !== blockId));
      setDeletingId(null);
    });
  }

  return (
    <section className="card max-w-lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Warmup Blocks</h2>
        {!creating && (
          <button
            type="button"
            onClick={() => { setCreating(true); setEditingId(null); }}
            className="btn-primary text-sm py-1.5"
          >
            + New Block
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-6 rounded-lg border border-border p-4 bg-surface">
          <p className="text-sm font-semibold text-[var(--text)] mb-3">New Warmup Block</p>
          <BlockEditor
            onSave={handleCreate}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {blocks.length === 0 && !creating && (
        <p className="text-sm text-muted">No warmup blocks yet. Create one above.</p>
      )}

      <div className="space-y-3">
        {blocks.map((block) => (
          <div key={block.id} className="rounded-lg border border-border bg-surface p-4">
            {editingId === block.id ? (
              <BlockEditor
                initial={block}
                onSave={(name, items) => handleUpdate(block.id, name, items)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-[var(--text)]">{block.name}</h3>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => { setEditingId(block.id); setCreating(false); }}
                      className="text-sm text-primary hover:underline outline-none focus:ring-1 focus:ring-primary rounded"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(block.id)}
                      disabled={deletingId === block.id}
                      className="text-sm text-error/70 hover:text-error hover:underline outline-none focus:ring-1 focus:ring-error rounded disabled:opacity-50"
                    >
                      {deletingId === block.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
                <ul className="space-y-1">
                  {block.items.map((item, i) => (
                    <li key={item.id} className="flex items-start gap-2 text-sm">
                      <span className="text-muted shrink-0">{i + 1}.</span>
                      <span className="text-[var(--text)]">
                        {item.name}
                        {item.details && (
                          <span className="ml-1 text-muted">— {item.details}</span>
                        )}
                      </span>
                    </li>
                  ))}
                  {block.items.length === 0 && (
                    <li className="text-sm text-muted italic">No exercises yet</li>
                  )}
                </ul>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
