"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { WorkoutSession, Exercise, Set as PrismaSet } from "@prisma/client";
import { updateSessionName, updateSessionNotes, applyTemplateToSession } from "@/app/actions/sessions";
import { listTemplates } from "@/app/actions/templates";
import { computeGroupPresentation } from "@/lib/group-presentation";
import { AddExerciseForm } from "./AddExerciseForm";
import { DeleteSessionButton } from "./DeleteSessionButton";
import { ExerciseRow } from "./ExerciseRow";
import { ActiveWorkoutMode } from "./ActiveWorkoutMode";
import { WarmupDisplay, WarmupAssigner } from "./WarmupSection";
import { WhoopExportButton } from "./WhoopExportButton";
import { useRouter } from "next/navigation";

type ExerciseWithSets = Exercise & { sets: PrismaSet[] };
type WarmupItem = { id: string; name: string; details: string | null; orderIndex: number };
type WarmupBlock = { id: string; name: string; items: WarmupItem[] };
type SessionWithExercises = WorkoutSession & {
  exercises: ExerciseWithSets[];
  warmupBlock?: WarmupBlock | null;
};
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
  canAddNewExercise = true,
  defaultExpanded = false,
  isClient = false,
  clientName = "",
}: {
  session: SessionWithExercises;
  catalog: CatalogItem[];
  trainerId?: string | null;
  showPreviousBest?: boolean;
  canAddNewExercise?: boolean;
  /** When true (e.g. calendar sidebar), exercises are visible without an extra expand tap. */
  defaultExpanded?: boolean;
  isClient?: boolean;
  clientName?: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(session.name ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [editNotesValue, setEditNotesValue] = useState(session.notes ?? "");
  const [openExerciseIds, setOpenExerciseIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyTemplates, setApplyTemplates] = useState<{ id: string; name: string }[]>([]);
  const [applyTemplateId, setApplyTemplateId] = useState("");
  const [applyMode, setApplyMode] = useState<"replace" | "append">("replace");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyPending, setApplyPending] = useState(false);
  const [workoutActive, setWorkoutActive] = useState(false);

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
  const totalSets = session.exercises.reduce((sum, e) => sum + e.sets.length, 0);
  const groupPresentation = useMemo(
    () =>
      computeGroupPresentation(
        session.exercises.map((e) => ({ id: e.id, groupId: e.groupId, orderIndex: e.orderIndex }))
      ),
    [session.exercises]
  );

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

  function handleSaveNotes() {
    const value = editNotesValue.trim() || null;
    if (value === (session.notes ?? null)) {
      setEditingNotes(false);
      return;
    }
    startTransition(async () => {
      await updateSessionNotes(session.id, session.clientId, value);
      setEditingNotes(false);
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

  const notesPreview = session.notes?.trim();
  const notesTruncated = notesPreview && notesPreview.length > 60 ? notesPreview.slice(0, 60) + "…" : notesPreview;

  return (
    <section className="card min-w-0">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full min-w-0 flex-col gap-2 text-left outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded sm:flex-row sm:items-start sm:justify-between sm:gap-3"
      >
        <div className="min-w-0 flex-1">
          {session.name ? (
            <h3 className="text-base font-semibold text-[var(--text)] break-words sm:text-lg">{session.name}</h3>
          ) : null}
          <p className={`text-sm ${session.name ? "text-muted mt-0.5" : "font-semibold text-[var(--text)]"}`}>
            {dateStr}
          </p>
        </div>
        <span className="flex min-w-0 flex-shrink-0 flex-row flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted sm:ml-2 sm:max-w-[min(100%,15rem)] sm:justify-end sm:text-sm">
          {notesTruncated ? (
            <span className="max-w-full truncate text-left sm:text-right" title={notesPreview}>
              {notesTruncated}
            </span>
          ) : null}
          <span className="shrink-0 whitespace-nowrap">
            {exerciseCount} exercise{exerciseCount !== 1 ? "s" : ""}
            {totalSets > 0 ? ` · ${totalSets} set${totalSets !== 1 ? "s" : ""}` : ""}
          </span>
          <span
            className={`inline-block shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
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
                  placeholder="Session Name"
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
                Edit Name
              </button>
            )}
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-[var(--text)]">Notes</h4>
            {editingNotes ? (
              <>
                <textarea
                  value={editNotesValue}
                  onChange={(e) => setEditNotesValue(e.target.value)}
                  placeholder="Session Notes"
                  rows={3}
                  className="input w-full py-1.5 text-sm resize-y min-h-[80px]"
                  disabled={isPending}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={isPending}
                    className="btn-primary text-sm py-1.5"
                  >
                    {isPending ? "…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditNotesValue(session.notes ?? "");
                      setEditingNotes(false);
                    }}
                    disabled={isPending}
                    className="btn-secondary text-sm py-1.5"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--text)] whitespace-pre-wrap min-h-[1.5em]">
                  {session.notes?.trim() ?? ""}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditNotesValue(session.notes ?? "");
                    setEditingNotes(true);
                  }}
                  className="text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                >
                  Edit Notes
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isClient && (
              <button
                type="button"
                onClick={() => setWorkoutActive(true)}
                className="btn-primary text-sm py-1.5 px-4 gap-1.5 font-semibold"
              >
                ▶ Start Workout
              </button>
            )}
            {session.exercises.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={expandAll}
                  className="btn-secondary text-sm py-1.5 px-3 gap-1.5"
                >
                  <span aria-hidden="true">⊞</span> Expand All
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="btn-secondary text-sm py-1.5 px-3 gap-1.5"
                >
                  <span aria-hidden="true">⊟</span> Collapse All
                </button>
              </>
            )}
            {trainerId && (
              <button
                type="button"
                onClick={() => setShowApplyModal(true)}
                className="btn-secondary text-sm py-1.5 px-3 gap-1.5"
              >
                <span aria-hidden="true">📋</span> Template
              </button>
            )}
            <WhoopExportButton sessionId={session.id} clientName={clientName} />
          </div>
          {/* Warmup section */}
          {session.warmupBlock && (
            <WarmupDisplay block={session.warmupBlock} />
          )}
          {!isClient && (
            <WarmupAssigner
              sessionId={session.id}
              currentBlock={session.warmupBlock ?? null}
              onChanged={() => router.refresh()}
            />
          )}

          {session.exercises.map((exercise) => (
            <ExerciseRow
              key={exercise.id}
              exercise={exercise}
              isOpen={openExerciseIds.has(exercise.id)}
              onToggle={() => toggleExercise(exercise.id)}
              clientId={session.clientId}
              sessionDate={session.date}
              showPreviousBest={showPreviousBest}
              groupPresentation={groupPresentation.byExerciseId.get(exercise.id)}
              uniqueGroups={groupPresentation.uniqueGroups}
              sessionId={session.id}
              onGroupChange={() => router.refresh()}
              isClient={isClient}
            />
          ))}
          <AddExerciseForm
            sessionId={session.id}
            catalog={catalog}
            trainerId={trainerId}
            onExerciseAdded={handleExerciseAdded}
            canAddNewExercise={canAddNewExercise}
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
      {workoutActive && (
        <ActiveWorkoutMode
          exercises={session.exercises}
          sessionName={session.name ?? null}
          sessionDate={session.date}
          onClose={() => {
            setWorkoutActive(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
