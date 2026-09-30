"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Exercise, Set } from "@prisma/client";
import { formatWeight } from "@/lib/units";
import type { GroupPresentation } from "@/lib/group-presentation";
import { usePreviousSessionBest } from "@/hooks/usePreviousSessionBest";
import { updateExerciseNotes } from "@/app/actions/exercises";
import { reorderSets } from "@/app/actions/sets";
import { isCompletedSet, isPlannedOnly, summarizeExerciseSets } from "@/lib/sets";
import { AddSetForm } from "./AddSetForm";
import { PlanSetsForm } from "./PlanSetsForm";
import { DeleteExerciseButton } from "./DeleteExerciseButton";
import { SetRow } from "./SetRow";
import { SortableList } from "./SortableList";
import { DragHandle, type DragHandleProps } from "./DragHandle";

type ExerciseWithSets = Exercise & { sets: Set[] };

function formatPreviousBestDate(performedAt: string): string {
  return new Date(performedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ExerciseRow({
  exercise,
  isOpen,
  onToggle,
  clientId,
  sessionDate,
  showPreviousBest = false,
  groupPresentation,
  uniqueGroups,
  sessionId,
  onGroupChange,
  isClient = false,
  /** When false (finished session), hide remove. Clients and trainers can remove otherwise. */
  canRemoveExercise = true,
  dragHandle,
}: {
  exercise: ExerciseWithSets;
  isOpen: boolean;
  onToggle: () => void;
  clientId?: string;
  sessionDate?: Date;
  showPreviousBest?: boolean;
  groupPresentation?: GroupPresentation | undefined;
  uniqueGroups?: { groupId: string; label: string }[];
  sessionId?: string;
  onGroupChange?: () => void;
  isClient?: boolean;
  canRemoveExercise?: boolean;
  /** Omitted in read-only contexts (e.g. the drag overlay preview). */
  dragHandle?: DragHandleProps;
}) {
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupTriggerRef = useRef<HTMLDivElement>(null);
  const groupPanelRef = useRef<HTMLDivElement>(null);
  const [groupMenuPosition, setGroupMenuPosition] = useState<{ top: number; left: number } | null>(null);

  // Exercise notes
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(exercise.notes ?? "");
  const [notesPending, startNotesPending] = useTransition();

  function handleSaveNotes() {
    const value = notesValue.trim() || null;
    if (value === (exercise.notes ?? null)) {
      setEditingNotes(false);
      return;
    }
    startNotesPending(async () => {
      await updateExerciseNotes(exercise.id, value);
      setEditingNotes(false);
    });
  }

  useEffect(() => {
    if (!groupMenuOpen || !groupTriggerRef.current) return;
    const rect = groupTriggerRef.current.getBoundingClientRect();
    const padding = 8;
    const maxW = Math.min(280, window.innerWidth * 0.9);
    let left = rect.left;
    if (left + maxW > window.innerWidth - padding) left = window.innerWidth - maxW - padding;
    if (left < padding) left = padding;
    setGroupMenuPosition({ top: rect.bottom + 4, left });
  }, [groupMenuOpen]);

  useEffect(() => {
    if (!groupMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        groupTriggerRef.current?.contains(target) ||
        groupPanelRef.current?.contains(target)
      )
        return;
      setGroupMenuOpen(false);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [groupMenuOpen]);

  async function setGroup(groupId: string | null) {
    if (!sessionId || !onGroupChange) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/exercises/${exercise.id}/group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      if (res.ok) {
        onGroupChange();
        setGroupMenuOpen(false);
      } else {
        setGroupMenuOpen(false);
      }
    } catch {
      setGroupMenuOpen(false);
    }
  }

  async function createNewGroup() {
    if (!sessionId || !onGroupChange) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseInstanceId: exercise.id }),
      });
      if (res.ok) {
        onGroupChange();
        setGroupMenuOpen(false);
      } else {
        setGroupMenuOpen(false);
      }
    } catch {
      setGroupMenuOpen(false);
    }
  }
  const { data: previousBest, loading: previousBestLoading } = usePreviousSessionBest({
    clientId: clientId ?? "",
    sessionDate: sessionDate ?? new Date(),
    catalogExerciseId: exercise.catalogExerciseId ?? undefined,
    exerciseName: exercise.name,
    enabled: showPreviousBest && !!clientId && !!sessionDate,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState(0);
  const [isDraggingSet, setIsDraggingSet] = useState(false);

  useEffect(() => {
    if (isOpen && contentRef.current) {
      const el = contentRef.current;
      const measure = () => setMaxHeight(el.scrollHeight);
      measure();
      requestAnimationFrame(measure);
    } else {
      setMaxHeight(0);
    }
  }, [isOpen, exercise.sets.length]);

  useEffect(() => {
    // Skip while a set is being dragged: dnd-kit's transforms retrigger the
    // observer every frame, and re-measuring mid-drag makes the panel jitter.
    if (!contentRef.current || !isOpen || isDraggingSet) return;
    const el = contentRef.current;
    const observer = new ResizeObserver(() => {
      setMaxHeight(el.scrollHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen, isDraggingSet]);

  const showGroupControls = !!sessionId && !!onGroupChange && !isClient;

  // Set 1 first, matching the order they're performed in (and workout mode).
  const setsAsc = [...exercise.sets].sort((a, b) => a.orderIndex - b.orderIndex);
  const summary = summarizeExerciseSets(setsAsc);
  // Prefill the add form from the last set actually performed, not from a
  // planned target that may never be hit.
  const lastCompletedSet = [...setsAsc].reverse().find(isCompletedSet) ?? null;

  return (
    <div
      className={`relative min-w-0 overflow-x-hidden rounded border border-border p-3 ${groupPresentation ? `border-l-4 ${groupPresentation.borderClass} ${groupPresentation.cardTintClass}` : "bg-background"}`}
    >
      <div className="sticky top-0 z-[5] flex min-w-0 flex-col gap-1.5 overflow-x-hidden bg-background py-3 -mx-3 px-3 rounded sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:min-h-[44px]">
        <div className="flex min-w-0 w-full flex-1 items-start gap-1">
        {dragHandle && (
          <div className="mt-0.5 shrink-0">
            <DragHandle {...dragHandle} />
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`exercise-${exercise.id}`}
          className="-my-3 flex min-h-[44px] min-w-0 w-full flex-1 flex-row items-start gap-2 py-0 text-left outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 sm:py-3 rounded"
        >
          <span
            className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center transition-transform duration-200 ${isOpen ? "rotate-90" : "rotate-0"}`}
            aria-hidden
          >
            ▶
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h4 className="min-w-0 font-medium text-[var(--text)] break-words">{exercise.name}</h4>
              {groupPresentation && (
                <span
                  className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-xs font-medium ${groupPresentation.chipClass}`}
                >
                  {groupPresentation.label}
                  {showGroupControls && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setGroup(null);
                      }}
                      className="ml-1 rounded hover:opacity-80 focus:ring-1 focus:ring-offset-0"
                      aria-label="Remove from group"
                      title="Remove from group"
                    >
                      ×
                    </button>
                  )}
                </span>
              )}
            </div>
            {showPreviousBest && (
              <p className="text-xs leading-snug text-muted break-words">
                {previousBestLoading && "Fetching previous session best…"}
                {!previousBestLoading && previousBest?.found === true && (
                  <>
                    Last time: {previousBest.setCount}{" "}
                    {previousBest.setCount === 1 ? "set" : "sets"} · best{" "}
                    {formatWeight(previousBest.weight)}×{previousBest.reps} (
                    {formatPreviousBestDate(previousBest.performedAt)})
                  </>
                )}
                {!previousBestLoading && previousBest && !previousBest.found && (
                  <>No previous history for this exercise</>
                )}
              </p>
            )}
            {!isOpen && (
              exercise.sets.length === 0 ? (
                <span className="block min-w-0 text-sm font-medium text-amber-500">
                  No sets yet
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                  {setsAsc.slice(0, 6).map((s) => (
                    <span
                      key={s.id}
                      title={isPlannedOnly(s) ? "Planned — not completed" : undefined}
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                        isPlannedOnly(s)
                          ? "border border-dashed border-muted/60 text-muted/70"
                          : "bg-muted/15 text-muted"
                      }`}
                    >
                      {formatWeight(s.weightKg)}×{s.reps}
                    </span>
                  ))}
                  {exercise.sets.length > 6 && (
                    <span className="inline-flex items-center text-xs text-muted">
                      +{exercise.sets.length - 6} more
                    </span>
                  )}
                  {summary.skippedCount > 0 && (
                    <span className="inline-flex items-center text-xs text-amber-600 dark:text-amber-400">
                      {summary.completedCount}/{summary.totalCount} done
                    </span>
                  )}
                </div>
              )
            )}
          </div>
        </button>
        </div>
        <div className="flex items-center gap-1 shrink-0 self-stretch sm:self-auto justify-end sm:justify-start min-h-[44px] sm:min-h-0" ref={groupTriggerRef}>
          {showGroupControls && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setGroupMenuOpen((o) => !o);
                }}
                className="tap-target rounded px-3 py-2 text-xs text-muted hover:bg-muted/50 outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 sm:px-2 sm:py-1"
                aria-expanded={groupMenuOpen}
                aria-haspopup="true"
              >
                Group
              </button>
              {groupMenuOpen &&
                groupMenuPosition &&
                typeof document !== "undefined" &&
                createPortal(
                  <div
                    ref={groupPanelRef}
                    className="fixed z-[100] w-max min-w-[180px] max-w-[min(280px,90vw)] rounded border border-border bg-background py-1 shadow-lg whitespace-nowrap"
                    style={{ top: groupMenuPosition.top, left: groupMenuPosition.left }}
                  >
                    {!exercise.groupId ? (
                      <>
                        <button
                          type="button"
                          onClick={() => createNewGroup()}
                          className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted/50"
                        >
                          Create New Group
                        </button>
                        {uniqueGroups?.length ? (
                          <>
                            <div className="my-1 border-t border-border" />
                            {uniqueGroups.map((g) => (
                              <button
                                key={g.groupId}
                                type="button"
                                onClick={() => setGroup(g.groupId)}
                                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted/50"
                              >
                                Add To {g.label}
                              </button>
                            ))}
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {uniqueGroups?.filter((g) => g.groupId !== exercise.groupId).length
                          ? uniqueGroups
                              .filter((g) => g.groupId !== exercise.groupId)
                              .map((g) => (
                                <button
                                  key={g.groupId}
                                  type="button"
                                  onClick={() => setGroup(g.groupId)}
                                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted/50"
                                >
                                  Move To {g.label}
                                </button>
                              ))
                          : null}
                        <div className="my-1 border-t border-border" />
                        <button
                          type="button"
                          onClick={() => setGroup(null)}
                          className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted/50 text-error"
                        >
                          Remove From Group
                        </button>
                      </>
                    )}
                  </div>,
                  document.body
                )}
            </>
          )}
          {canRemoveExercise && (
            <DeleteExerciseButton
              exerciseId={exercise.id}
              exerciseName={exercise.name}
              setsCount={exercise.sets.length}
            />
          )}
        </div>
      </div>
      <div
        id={`exercise-${exercise.id}`}
        style={{ maxHeight: maxHeight === 0 ? 0 : maxHeight }}
        className="overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out md:duration-300"
      >
        <div
          ref={contentRef}
          className={`pb-1 transition-opacity duration-200 ease-in-out md:duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}
        >
          {/* Exercise notes */}
          <div className="mb-2 mt-1">
            {editingNotes ? (
              <div className="flex flex-col gap-1.5">
                <input
                  type="text"
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="Exercise notes"
                  className="input w-full py-1 text-sm"
                  disabled={notesPending}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveNotes();
                    if (e.key === "Escape") {
                      setNotesValue(exercise.notes ?? "");
                      setEditingNotes(false);
                    }
                  }}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={notesPending}
                    className="btn-primary text-xs py-1 px-2"
                  >
                    {notesPending ? "…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotesValue(exercise.notes ?? "");
                      setEditingNotes(false);
                    }}
                    disabled={notesPending}
                    className="btn-secondary text-xs py-1 px-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {exercise.notes?.trim() && (
                  <p className="text-xs text-muted italic">{exercise.notes}</p>
                )}
                <button
                  type="button"
                  onClick={() => setEditingNotes(true)}
                  className="text-xs text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded"
                >
                  {exercise.notes?.trim() ? "Edit Notes" : "Add Notes"}
                </button>
              </div>
            )}
          </div>
          <ul className="mb-2">
            <SortableList
              items={setsAsc}
              className="space-y-1.5"
              itemLabel={(_s, i) => `Reorder set ${i + 1}`}
              onDragStateChange={setIsDraggingSet}
              onReorder={(ids) => reorderSets(exercise.id, ids)}
              renderItem={(s, i, { handle }) => (
                <SetRow set={s} setNumber={i + 1} dragHandle={handle} />
              )}
              renderOverlay={(s, i) => (
                <ul className="w-[min(28rem,90vw)] opacity-95 shadow-lg">
                  <SetRow set={s} setNumber={i + 1} />
                </ul>
              )}
            />
          </ul>
          <AddSetForm
            exerciseId={exercise.id}
            lastSet={lastCompletedSet ?? (setsAsc.length > 0 ? setsAsc[setsAsc.length - 1] : null)}
            setCount={exercise.sets.length}
          />
          {!isClient && (
            <div className="mt-2">
              <PlanSetsForm exerciseId={exercise.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
