"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import {
  listTrainerExercises,
  type TrainerCatalogItem,
} from "@/app/actions/trainer-exercises";
import { useTemplates } from "@/hooks/useTemplates";
import type { TemplateWithItems } from "@/app/actions/templates";
import { useToast } from "@/components/ui/toast/use-toast";

const MODAL_Z = 1002;
const NAME_MIN = 2;
const NAME_MAX = 60;

type View = "list" | "create" | "edit";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function TemplatesManagerModal({ isOpen, onClose }: Props) {
  const { data: session } = useSession();
  const isTrainer = (session?.user as { role?: string })?.role === "TRAINER";
  const trainerId = isTrainer ? session?.user?.id ?? null : null;

  const {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    archiveTemplate,
    refresh,
  } = useTemplates(false);

  const [catalog, setCatalog] = useState<TrainerCatalogItem[]>([]);
  const [view, setView] = useState<View>("list");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    if (!isOpen || !trainerId) return;
    let cancelled = false;
    listTrainerExercises(false).then((list) => {
      if (!cancelled) setCatalog(list);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, trainerId]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const filteredTemplates = search.trim()
    ? templates.filter((t) =>
        t.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : templates;

  const resetForm = useCallback(() => {
    setName("");
    setSelectedNames([]);
    setErrors({});
    setEditingId(null);
    setView("list");
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
      setErrors({ name: `Name must be ${NAME_MIN}–${NAME_MAX} characters` });
      return;
    }
    if (selectedNames.length < 1 || selectedNames.length > 50) {
      setErrors({ items: "Template must have 1–50 exercises" });
      return;
    }
    setIsPending(true);
    const result = await createTemplate({ name: trimmed, exerciseNames: selectedNames });
    setIsPending(false);
    if (result.ok) {
      addToast("success", "Template created.");
      resetForm();
    } else {
      setErrors(result.errors as Record<string, string>);
      if (result.errors._) addToast("error", result.errors._);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setErrors({});
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
      setErrors({ name: `Name must be ${NAME_MIN}–${NAME_MAX} characters` });
      return;
    }
    if (selectedNames.length < 1 || selectedNames.length > 50) {
      setErrors({ items: "Template must have 1–50 exercises" });
      return;
    }
    setIsPending(true);
    const result = await updateTemplate(editingId, {
      name: trimmed,
      items: selectedNames.map((exerciseName, orderIndex) => ({
        exerciseName,
        orderIndex,
      })),
    });
    setIsPending(false);
    if (result.ok) {
      addToast("success", "Template updated.");
      resetForm();
    } else {
      setErrors(result.errors as Record<string, string>);
      if (result.errors._) addToast("error", result.errors._);
    }
  };

  const handleArchive = async (t: TemplateWithItems) => {
    const result = await archiveTemplate(t.id);
    if (result.ok) {
      addToast("success", "Template archived.");
      if (editingId === t.id) resetForm();
    } else {
      addToast("error", result.error ?? "Could not archive.");
    }
  };

  const startEdit = (t: TemplateWithItems) => {
    setEditingId(t.id);
    setName(t.name);
    setSelectedNames(t.items.map((i) => i.exerciseName));
    setView("edit");
    setErrors({});
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/50"
      style={{ zIndex: MODAL_Z }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="templates-modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 mb-4">
          <h2 id="templates-modal-title" className="text-lg font-semibold text-[var(--text)]">
            Workout Templates
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-[var(--text)] outline-none focus:ring-2 focus:ring-primary rounded p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {view === "list" && (
          <>
            <div className="mb-3">
              <label htmlFor="template-search" className="sr-only">
                Search templates
              </label>
              <input
                id="template-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                className="input w-full py-1.5 text-sm"
              />
            </div>
            {isLoading ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : filteredTemplates.length === 0 ? (
              <p className="text-sm text-muted">
                {search.trim() ? "No templates match." : "No templates yet."}
              </p>
            ) : (
              <ul className="space-y-2 mb-4">
                {filteredTemplates.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text)] truncate">{t.name}</p>
                      <p className="text-xs text-muted">
                        {t.items.length} exercise{t.items.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(t)}
                        className="text-sm text-primary hover:underline outline-none focus:ring-2 focus:ring-primary rounded"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchive(t)}
                        className="text-sm text-error hover:underline outline-none focus:ring-2 focus:ring-primary rounded"
                      >
                        Archive
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => {
                setView("create");
                setName("");
                setSelectedNames([]);
                setErrors({});
              }}
              className="btn-primary text-sm py-1.5"
            >
              New template
            </button>
          </>
        )}

        {(view === "create" || view === "edit") && (
          <form
            onSubmit={view === "create" ? handleCreate : handleUpdate}
            className="space-y-4"
          >
            <div>
              <label htmlFor="template-name" className="block text-sm font-medium text-[var(--text)] mb-1">
                Template name
              </label>
              <input
                id="template-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.name;
                    return next;
                  });
                }}
                placeholder="e.g. Push day"
                maxLength={NAME_MAX}
                className="input w-full py-1.5 text-sm"
                disabled={isPending}
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="mt-1 text-xs text-error" role="alert">
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1">
                Exercises (in order)
              </label>
              <p className="text-xs text-muted mb-2">
                Add from your exercise list, then reorder with the arrows.
              </p>
              <AddExerciseSelect
                catalog={catalog}
                selectedNames={selectedNames}
                onAdd={(n) =>
                  setSelectedNames((prev) =>
                    prev.includes(n) ? prev : [...prev, n]
                  )
                }
                onRemove={(n) =>
                  setSelectedNames((prev) => prev.filter((x) => x !== n))
                }
                onMoveUp={(i) =>
                  setSelectedNames((prev) => {
                    if (i <= 0) return prev;
                    const next = [...prev];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    return next;
                  })
                }
                onMoveDown={(i) =>
                  setSelectedNames((prev) => {
                    if (i >= prev.length - 1) return prev;
                    const next = [...prev];
                    [next[i], next[i + 1]] = [next[i + 1], next[i]];
                    return next;
                  })
                }
                disabled={isPending}
              />
              {errors.items && (
                <p className="mt-1 text-xs text-error" role="alert">
                  {errors.items}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isPending || selectedNames.length === 0}
                className="btn-primary text-sm py-1.5"
              >
                {isPending ? "Saving…" : view === "create" ? "Create" : "Save"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                disabled={isPending}
                className="btn-secondary text-sm py-1.5"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : null;
}

function AddExerciseSelect({
  catalog,
  selectedNames,
  onAdd,
  onRemove,
  onMoveUp,
  onMoveDown,
  disabled,
}: {
  catalog: TrainerCatalogItem[];
  selectedNames: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  disabled?: boolean;
}) {
  const [selectValue, setSelectValue] = useState("");
  const available = catalog.filter((c) => !selectedNames.includes(c.name));

  return (
    <div className="space-y-2">
      {available.length > 0 && (
        <select
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v) {
              onAdd(v);
              setSelectValue("");
            }
          }}
          className="input w-full py-1.5 text-sm"
          disabled={disabled}
          aria-label="Add exercise to template"
        >
          <option value="">Add exercise…</option>
          {available.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      {selectedNames.length === 0 ? (
        <p className="text-sm text-muted">No exercises added yet.</p>
      ) : (
        <ul className="space-y-1 border border-border rounded p-2 bg-background/50">
          {selectedNames.map((name, i) => (
            <li
              key={`${name}-${i}`}
              className="flex items-center justify-between gap-2 py-1 text-sm"
            >
              <span className="min-w-0 truncate text-[var(--text)]">
                {i + 1}. {name}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onMoveUp(i)}
                  disabled={disabled || i === 0}
                  className="p-1 text-muted hover:text-[var(--text)] disabled:opacity-40 rounded"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onMoveDown(i)}
                  disabled={disabled || i === selectedNames.length - 1}
                  className="p-1 text-muted hover:text-[var(--text)] disabled:opacity-40 rounded"
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(name)}
                  disabled={disabled}
                  className="p-1 text-error hover:underline rounded"
                  aria-label={`Remove ${name}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
