"use client";

import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import type { WorkoutSession, Exercise, Set as PrismaSet } from "@prisma/client";
import { updateSessionName, applyTemplateToSession } from "@/app/actions/sessions";
import { listTemplates } from "@/app/actions/templates";
import { AddExerciseForm } from "./AddExerciseForm";
import { DeleteSessionButton } from "./DeleteSessionButton";
import { ExerciseRow } from "./ExerciseRow";
import { useRouter } from "next/navigation";

type ExerciseWithSets = Exercise & { sets: PrismaSet[] };
type SessionWithExercises = WorkoutSession & { exercises: ExerciseWithSets[] };
type CatalogItem = { id: string; name: string };

function formatSessionDate(date: Date): string {
  const d = new Date(date);
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const medium = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `${weekday} · ${medium}`;
}

export function SessionBlock({
  session,
  catalog,
  trainerId,
  showPreviousBest = false,
}: {
  session: SessionWithExercises;
  catalog: CatalogItem[];
  trainerId?: string | null;
  showPreviousBest?: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(session.name ?? "");
  const [openExerciseIds, setOpenExerciseIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyTemplates, setApplyTemplates] = useState<{ id: string; name: string }[]>([]);
  const [applyTemplateId, setApplyTemplateId] = useState("");
  const [applyMode, setApplyMode] = useState<"replace" | "append">("replace");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyPending, setApplyPending] = useState(false);

  useEffect(() => {
    if (!showApplyModal) return;
    listTemplates(false).then((result) => {
      if (result.ok) {
        setApplyTemplates(result.templates.map((t) => ({ id: t.id, name: t.name })));
      } else {
        setApplyTemplates([]);
      }
    });
  }, [showApplyModal]);

  function toggleExercise(id: string) {
    setOpenExerciseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setOpenExerciseIds(new Set(session.exercises.map((e) => e.id)));
  }

  function collapseAll() {
    setOpenExerciseIds(new Set());
  }

  function handleExerciseAdded(newExerciseId: string) {
    setOpenExerciseIds(new Set([newExerciseId]));
  }

  const dateStr = formatSessionDate(session.date);
  const exerciseCount = session.exercises.length;

  function handleSaveName() {
    const value = editNameValue.trim() || null;
    if (value === (session.name ?? null)) {
      setEditingName(false);
      return;
    }
    startTransition(async () => {
      await updateSessionName(session.id, session.clientId, value);
      setEditingName(false);
    });
  }

  async function handleApplyTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!applyTemplateId.trim()) return;
    setApplyError(null);
    setApplyPending(true);
    const result = await applyTemplateToSession(session.id, applyTemplateId, applyMode);
    setApplyPending(false);
    if (result.ok) {
      setShowApplyModal(false);
      setApplyTemplateId("");
      setApplyMode("replace");
      router.refresh();
    } else {
      setApplyError(result.error ?? "Failed to apply template");
    }
  }

  const applyModal =
    showApplyModal &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 z-[1001]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-template-title"
        onClick={() => !applyPending && setShowApplyModal(false)}
      >
        <form
          onSubmit={handleApplyTemplate}
          className="card w-full max-w-sm space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="apply-template-title" className="text-lg font-semibold text-[var(--text)]">
            Apply template
          </h3>
          <p className="text-sm text-muted">
            Add exercises from a template to this session. Replace removes current exercises; Append adds after them.
          </p>
          <div>
            <label htmlFor="apply-template-select" className="block text-sm font-medium text-[var(--text)] mb-1">
              Template
            </label>
            <select
              id="apply-template-select"
              value={applyTemplateId}
              onChange={(e) => setApplyTemplateId(e.target.value)}
              className="input w-full py-1.5 text-sm"
              disabled={applyPending}
            >
              <option value="">Select…</option>
              {applyTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="block text-sm font-medium text-[var(--text)] mb-2">Mode</span>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="apply-mode"
                checked={applyMode === "replace"}
                onChange={() => setApplyMode("replace")}
                disabled={applyPending}
              />
              Replace existing exercises
            </label>
            <label className="flex items-center gap-2 text-sm mt-1">
              <input
                type="radio"
                name="apply-mode"
                checked={applyMode === "append"}
                onChange={() => setApplyMode("append")}
                disabled={applyPending}
              />
              Append to existing
            </label>
          </div>
          {applyError && (
            <p className="text-sm text-error" role="alert">
              {applyError}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowApplyModal(false)}
              disabled={applyPending}
              className="btn-secondary text-sm py-1.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={applyPending || !applyTemplateId}
              className="btn-primary text-sm py-1.5"
            >
              {applyPending ? "Applying…" : "Apply"}
            </button>
          </div>
        </form>
      </div>,
      document.body
    );

  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-left outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
      >
        <div className="min-w-0 flex-1">
          {session.name ? (
            <h3 className="text-lg font-semibold text-[var(--text)] truncate">{session.name}</h3>
          ) : null}
          <p className={`text-sm ${session.name ? "text-muted mt-0.5" : "font-semibold text-[var(--text)]"}`}>
            {dateStr}
          </p>
        </div>
        <span className="flex items-center gap-2 text-sm text-muted shrink-0 ml-2">
          {exerciseCount} exercise{exerciseCount !== 1 ? "s" : ""}
          <span
            className={`inline-block transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▼
          </span>
        </span>
      </button>
      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            {editingName ? (
              <>
                <input
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  placeholder="Session name"
                  className="input flex-1 py-1.5 text-sm"
                  disabled={isPending}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") {
                      setEditNameValue(session.name ?? "");
                      setEditingName(false);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={isPending}
                  className="btn-primary text-sm py-1.5"
                >
                  {isPending ? "…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditNameValue(session.name ?? "");
                    setEditingName(false);
                  }}
                  disabled={isPending}
                  className="btn-secondary text-sm py-1.5"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditNameValue(session.name ?? "");
                  setEditingName(true);
                }}
                className="text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
              >
                Edit name
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {session.exercises.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={expandAll}
                  className="text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                >
                  Collapse all
                </button>
              </>
            )}
            {trainerId && (
              <button
                type="button"
                onClick={() => setShowApplyModal(true)}
                className="text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
              >
                Apply template
              </button>
            )}
          </div>
          {session.exercises.map((exercise) => (
            <ExerciseRow
              key={exercise.id}
              exercise={exercise}
              isOpen={openExerciseIds.has(exercise.id)}
              onToggle={() => toggleExercise(exercise.id)}
              clientId={session.clientId}
              sessionDate={session.date}
              showPreviousBest={showPreviousBest}
            />
          ))}
          <AddExerciseForm
            sessionId={session.id}
            catalog={catalog}
            trainerId={trainerId}
            onExerciseAdded={handleExerciseAdded}
          />
          <div className="pt-2 border-t border-[var(--border)]">
            <DeleteSessionButton
              sessionId={session.id}
              clientId={session.clientId}
              dateStr={dateStr}
              hasContent={session.exercises.length > 0}
            />
          </div>
        </div>
      )}
      {applyModal}
    </section>
  );
}
