"use client";

import React, { useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  createExercise,
  createExerciseFromName,
} from "@/app/actions/exercises";
import { addExerciseToTrainerCatalog } from "@/app/actions/trainer-exercises";
import { useExerciseCatalogStore } from "@/store/exercise-catalog";
import type { TrainerCatalogItem } from "@/store/exercise-catalog";

const MAX_EXERCISE_NAME_LEN = 120;

/** Case-insensitive filter: option name contains query. */
function filterOptionsByQuery(
  options: { id: string; name: string }[],
  query: string
): { id: string; name: string }[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => o.name.toLowerCase().includes(q));
}

/** Portal-rendered dropdown with search so the list is not clipped/mispositioned by ancestor overflow. */
function ExerciseSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string }[];
  placeholder: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom,
      left: rect.left,
      width: Math.max(rect.width, 200),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    updatePosition();
    searchInputRef.current?.focus();
  }, [open, updatePosition]);

  // Keep dropdown under the trigger when the page (main) scrolls — main is the scroll container, not window.
  useEffect(() => {
    if (!open) return;
    const scrollContainer = document.querySelector("main");
    if (!scrollContainer) return;
    const handler = () => updatePosition();
    scrollContainer.addEventListener("scroll", handler, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", handler);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      const portalRoot = document.getElementById("exercise-select-list");
      if (portalRoot?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [open]);

  const selectedName = value ? options.find((o) => o.id === value)?.name : null;
  const filteredOptions = filterOptionsByQuery(options, searchQuery);

  const dropdown =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        id="exercise-select-list"
        className="fixed z-[1100] rounded border border-border bg-surface shadow-lg max-h-[320px] overflow-hidden flex flex-col"
        style={{
          top: position.top,
          left: position.left,
          width: Math.max(position.width, 260),
        }}
        role="listbox"
      >
        <div className="p-2 border-b border-border sticky top-0 bg-surface">
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder="Search exercises…"
            aria-label="Filter exercises"
            className="input w-full py-1.5 text-sm"
          />
        </div>
        <div className="overflow-y-auto py-1 max-h-[260px]">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className="w-full px-3 py-2 text-left text-sm hover:bg-background/80 focus:bg-background/80 focus:outline-none text-muted"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            {placeholder}
          </button>
          {filteredOptions.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={value === item.id}
              className="w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-background/80 focus:bg-background/80 focus:outline-none"
              onClick={() => {
                onChange(item.id);
                setOpen(false);
              }}
            >
              {item.name}
            </button>
          ))}
          {filteredOptions.length === 0 && options.length > 0 && (
            <p className="px-3 py-2 text-sm text-muted">No exercises match “{searchQuery}”</p>
          )}
        </div>
      </div>,
      document.body
    );

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="input flex-1 min-w-[160px] py-1.5 text-sm text-left flex items-center justify-between gap-2"
      >
        <span className={selectedName ? "text-[var(--text)]" : "text-muted"}>
          {selectedName ?? placeholder}
        </span>
        <span aria-hidden className="shrink-0">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {dropdown}
    </>
  );
}

/** Stable empty array so store selector doesn't return a new reference each time (avoids getSnapshot infinite loop). */
const EMPTY_STORE_LIST: TrainerCatalogItem[] = [];

type CatalogItem = { id: string; name: string };

export function AddExerciseForm({
  sessionId,
  catalog,
  trainerId,
  onExerciseAdded,
  canAddNewExercise = true,
}: {
  sessionId: string;
  catalog: CatalogItem[];
  trainerId?: string | null;
  onExerciseAdded?: (newExerciseId: string) => void;
  /** When false, only the catalog dropdown is shown (e.g. clients cannot add new exercise names). */
  canAddNewExercise?: boolean;
}) {
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const storeList = useExerciseCatalogStore((s) =>
    trainerId ? (s.byTrainer[trainerId] ?? EMPTY_STORE_LIST) : EMPTY_STORE_LIST
  );
  const setForTrainer = useExerciseCatalogStore((s) => s.setForTrainer);
  const addToStore = useExerciseCatalogStore((s) => s.addItem);

  React.useEffect(() => {
    if (trainerId && catalog.length > 0) {
      setForTrainer(
        trainerId,
        catalog.map((c) => ({ id: c.id, name: c.name, isArchived: false }))
      );
    }
  }, [trainerId, catalog, setForTrainer]);

  const displayCatalog = trainerId
    ? (storeList.length > 0 ? storeList : catalog)
    : catalog;

  function handleAddFromCatalog(e: React.FormEvent) {
    e.preventDefault();
    const id = selectedCatalogId.trim();
    if (!id) return;
    const displayName = displayCatalog.find((c) => c.id === id)?.name ?? "";
    startTransition(async () => {
      const newExerciseId = trainerId
        ? await createExercise(sessionId, displayName)
        : await createExercise(sessionId, displayName, id);
      setSelectedCatalogId("");
      if (newExerciseId) {
        onExerciseAdded?.(newExerciseId);
      }
      router.refresh();
    });
  }

  function handleAddNew(e: React.FormEvent) {
    e.preventDefault();
    const n = newName.trim();
    if (!n || n.length > MAX_EXERCISE_NAME_LEN) return;
    startTransition(async () => {
      if (trainerId) {
        const result = await addExerciseToTrainerCatalog(trainerId, n);
        if (result.ok) addToStore(trainerId, result.item);
      }
      const newExerciseId = trainerId
        ? await createExercise(sessionId, n)
        : await createExerciseFromName(sessionId, n);
      setNewName("");
      if (newExerciseId) {
        onExerciseAdded?.(newExerciseId);
      }
      router.refresh();
    });
  }

  const trimmedNewName = newName.trim();
  const isOverMax = trimmedNewName.length > MAX_EXERCISE_NAME_LEN;
  const isNewNameInvalid = !trimmedNewName || isOverMax;
  const addNewDisabled = isPending || isNewNameInvalid;

  return (
    <div className="space-y-3 border-t border-dashed border-border pt-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={handleAddFromCatalog}
      >
        <ExerciseSelect
          value={selectedCatalogId}
          onChange={setSelectedCatalogId}
          options={displayCatalog}
          placeholder="Select exercise…"
          disabled={isPending}
          aria-label="Choose exercise from catalog"
        />
        <button
          type="submit"
          disabled={isPending || !selectedCatalogId}
          className="btn-primary text-sm py-1.5"
        >
          {isPending ? "Adding…" : "Add from catalog"}
        </button>
      </form>
      {canAddNewExercise && (
        <form
          className="flex flex-col gap-1"
          onSubmit={handleAddNew}
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Or add new exercise name"
              title={newName.length > 40 ? newName : undefined}
              className={`input flex-1 min-w-0 max-w-full py-1.5 text-sm ${isOverMax ? "border-rose-500 focus:ring-rose-500" : ""}`}
              disabled={isPending}
              aria-invalid={isOverMax}
              aria-describedby={isOverMax ? "new-exercise-length-error" : undefined}
            />
            <button
              type="submit"
              disabled={addNewDisabled}
              title={isOverMax ? `Exercise name must be ≤ ${MAX_EXERCISE_NAME_LEN} characters` : !trimmedNewName ? "Enter an exercise name" : undefined}
              className="rounded bg-secondary px-3 py-1.5 text-sm text-white outline-none hover:bg-secondary-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 shrink-0"
            >
              {isPending ? "Adding…" : "Add new"}
            </button>
          </div>
          {isOverMax && (
            <p id="new-exercise-length-error" className="text-sm text-rose-600" role="alert">
              Exercise name must be ≤ {MAX_EXERCISE_NAME_LEN} characters ({trimmedNewName.length} entered).
            </p>
          )}
          {trimmedNewName.length > 0 && trimmedNewName.length >= Math.floor(MAX_EXERCISE_NAME_LEN * 0.8) && !isOverMax && (
            <p className="text-xs text-muted">
              {trimmedNewName.length}/{MAX_EXERCISE_NAME_LEN} characters
            </p>
          )}
        </form>
      )}
    </div>
  );
}
