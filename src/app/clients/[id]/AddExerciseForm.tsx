"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createExercise,
  createExerciseFromName,
} from "@/app/actions/exercises";

type CatalogItem = { id: string; name: string };

export function AddExerciseForm({
  sessionId,
  catalog,
}: {
  sessionId: string;
  catalog: CatalogItem[];
}) {
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleAddFromCatalog(e: React.FormEvent) {
    e.preventDefault();
    const id = selectedCatalogId.trim();
    if (!id) return;
    startTransition(async () => {
      await createExercise(sessionId, "", id);
      setSelectedCatalogId("");
      router.refresh();
    });
  }

  function handleAddNew(e: React.FormEvent) {
    e.preventDefault();
    const n = newName.trim();
    if (!n) return;
    startTransition(async () => {
      await createExerciseFromName(sessionId, n);
      setNewName("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 border-t border-dashed border-border pt-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={handleAddFromCatalog}
      >
        <select
          value={selectedCatalogId}
          onChange={(e) => setSelectedCatalogId(e.target.value)}
          className="input flex-1 min-w-[160px] py-1.5 text-sm"
          disabled={isPending}
          aria-label="Choose exercise from catalog"
        >
          <option value="">Select exercise…</option>
          {catalog.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending || !selectedCatalogId}
          className="btn-primary text-sm py-1.5"
        >
          {isPending ? "Adding…" : "Add from catalog"}
        </button>
      </form>
      <form
        className="flex items-center gap-2"
        onSubmit={handleAddNew}
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Or add new exercise name"
          className="input flex-1 py-1.5 text-sm"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending || !newName.trim()}
          className="rounded bg-secondary px-3 py-1.5 text-sm text-white outline-none hover:bg-secondary-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add new"}
        </button>
      </form>
    </div>
  );
}
