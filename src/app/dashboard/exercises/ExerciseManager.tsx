"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addTrainerExercise,
  archiveTrainerExercise,
  unarchiveTrainerExercise,
} from "@/app/actions/trainer-exercises";
import type { TrainerCatalogItem } from "@/app/actions/trainer-exercises";
import { useToast } from "@/components/ui/toast/use-toast";
import { useExerciseCatalogStore } from "@/store/exercise-catalog";

const NAME_MIN = 2;
const NAME_MAX = 60;

export function ExerciseManager({
  trainerId,
  initialActive,
  initialArchived,
}: {
  trainerId: string;
  initialActive: TrainerCatalogItem[];
  initialArchived: TrainerCatalogItem[];
}) {
  const [active, setActive] = useState<TrainerCatalogItem[]>(initialActive);
  const [archived, setArchived] = useState<TrainerCatalogItem[]>(initialArchived);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { addToast } = useToast();
  const addToStore = useExerciseCatalogStore((s) => s.addItem);

  const filteredActive = search.trim()
    ? active.filter((e) =>
        e.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : active;

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const name = newName.trim();
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      setAddError(`Name must be ${NAME_MIN}–${NAME_MAX} characters.`);
      return;
    }
    if (!/[a-zA-Z0-9]/.test(name)) {
      setAddError("Name must contain at least one letter or number.");
      return;
    }
    startTransition(async () => {
      const result = await addTrainerExercise(name);
      if (result.ok) {
        setActive((prev) => [...prev, result.item].sort((a, b) => a.name.localeCompare(b.name)));
        addToStore(trainerId, result.item);
        setNewName("");
        addToast("success", "Exercise added.");
      } else {
        setAddError(result.error);
        addToast("error", result.error);
      }
      router.refresh();
    });
  }

  function handleArchive(item: TrainerCatalogItem) {
    startTransition(async () => {
      const result = await archiveTrainerExercise(item.id);
      if (result.ok) {
        setActive((prev) => prev.filter((e) => e.id !== item.id));
        setArchived((prev) => [...prev, { ...item, isArchived: true }].sort((a, b) => a.name.localeCompare(b.name)));
        addToast("success", "Exercise removed.");
      } else {
        addToast("error", result.error ?? "Could not update exercises. Try again.");
      }
      router.refresh();
    });
  }

  function handleUnarchive(item: TrainerCatalogItem) {
    startTransition(async () => {
      const result = await unarchiveTrainerExercise(item.id);
      if (result.ok) {
        setArchived((prev) => prev.filter((e) => e.id !== item.id));
        setActive((prev) => [...prev, { ...item, isArchived: false }].sort((a, b) => a.name.localeCompare(b.name)));
        addToast("success", "Exercise restored.");
      } else {
        addToast("error", result.error ?? "Could not update exercises. Try again.");
      }
      router.refresh();
    });
  }

  return (
    <section className="card max-w-2xl">
      <div className="space-y-4">
        <div>
          <label htmlFor="exercise-search" className="mb-1 block text-sm font-medium text-[var(--text)]">
            Search
          </label>
          <input
            id="exercise-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter exercises…"
            className="input w-full py-1.5 text-sm"
          />
        </div>

        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="new-exercise-name" className="mb-1 block text-sm font-medium text-[var(--text)]">
              Add exercise
            </label>
            <input
              id="new-exercise-name"
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setAddError(null); }}
              placeholder="e.g. Bench Press"
              maxLength={NAME_MAX}
              className="input w-full py-1.5 text-sm"
              disabled={isPending}
              aria-invalid={!!addError}
              aria-describedby={addError ? "add-error" : undefined}
            />
            {addError && (
              <p id="add-error" className="mt-1 text-sm text-error" role="alert">
                {addError}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isPending || newName.trim().length < NAME_MIN}
            className="btn-primary text-sm py-1.5 px-4"
          >
            {isPending ? "Adding…" : "Add"}
          </button>
        </form>

        <div>
          <h3 className="text-sm font-medium text-[var(--text)] mb-2">Active exercises</h3>
          {filteredActive.length === 0 ? (
            <p className="text-sm text-muted">
              {search.trim() ? "No exercises match your search." : "No exercises yet. Add one above."}
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredActive.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0"
                >
                  <span className="font-medium text-[var(--text)]">{item.name}</span>
                  <button
                    type="button"
                    onClick={() => handleArchive(item)}
                    disabled={isPending}
                    className="text-sm text-error hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {archived.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowArchived((s) => !s)}
              className="text-sm font-medium text-[var(--text)] hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
            >
              {showArchived ? "▼" : "▶"} Archived ({archived.length})
            </button>
            {showArchived && (
              <ul className="mt-2 space-y-2 pl-2 border-l-2 border-border">
                {archived.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 py-1.5"
                  >
                    <span className="text-sm text-muted">{item.name}</span>
                    <button
                      type="button"
                      onClick={() => handleUnarchive(item)}
                      disabled={isPending}
                      className="text-sm text-primary hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded disabled:opacity-50"
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
