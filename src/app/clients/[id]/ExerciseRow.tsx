"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Exercise, Set } from "@prisma/client";
import { formatWeight } from "@/lib/units";
import type { GroupPresentation } from "@/lib/group-presentation";
import { usePreviousSessionBest } from "@/hooks/usePreviousSessionBest";
import { AddSetForm } from "./AddSetForm";
import { DeleteExerciseButton } from "./DeleteExerciseButton";
import { SetRow } from "./SetRow";

type ExerciseWithSets = Exercise & { sets: Set[] };

function setsSummary(sets: Set[]): string {
  if (sets.length === 0) return "No sets";
  return sets
    .map((s) => `${formatWeight(s.weightKg)} × ${s.reps}`)
    .join(", ");
}

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
}) {
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupTriggerRef = useRef<HTMLDivElement>(null);
  const groupPanelRef = useRef<HTMLDivElement>(null);
  const [groupMenuPosition, setGroupMenuPosition] = useState<{ top: number; left: number } | null>(null);

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
    if (!contentRef.current || !isOpen) return;
    const el = contentRef.current;
    const observer = new ResizeObserver(() => {
      setMaxHeight(el.scrollHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen]);

  const showGroupControls = !!sessionId && !!onGroupChange;

  return (
    <div
      className={`relative overflow-visible rounded border border-border p-3 ${groupPresentation ? `border-l-4 ${groupPresentation.borderClass} ${groupPresentation.cardTintClass}` : "bg-background"}`}
    >
      <div className="sticky top-0 z-[5] flex flex-col gap-1.5 py-3 bg-background -mx-3 px-3 rounded overflow-visible sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:min-h-[44px]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`exercise-${exercise.id}`}
          className="flex min-h-[44px] min-w-0 flex-1 flex-col gap-0.5 py-0 text-left outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded -my-3 sm:flex-row sm:items-center sm:gap-2 sm:py-3"
        >
          <span
            className={`inline-block shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : "rotate-0"}`}
            aria-hidden
          >
            ▶
          </span>
          <div className="min-w-0 flex-1 w-full sm:w-auto">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="font-medium text-[var(--text)] truncate">{exercise.name}</h4>
              {groupPresentation && (
                <span
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium shrink-0 ${groupPresentation.chipClass}`}
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
              <p className="mt-0.5 text-xs text-muted break-words min-w-0 w-full">
                {previousBestLoading && "Fetching previous session best…"}
                {!previousBestLoading && previousBest?.found === true && (
                  <>Previous session best: {formatWeight(previousBest.weight)}×{previousBest.reps} ({formatPreviousBestDate(previousBest.performedAt)})</>
                )}
                {!previousBestLoading && previousBest && !previousBest.found && (
                  <>No previous history for this exercise</>
                )}
              </p>
            )}
          </div>
          {!isOpen && (
            <span className="text-sm text-muted w-full truncate sm:shrink-0 sm:w-auto">
              {setsSummary(exercise.sets)}
            </span>
          )}
        </button>
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
                          Create new group
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
                                Add to {g.label}
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
                                  Move to {g.label}
                                </button>
                              ))
                          : null}
                        <div className="my-1 border-t border-border" />
                        <button
                          type="button"
                          onClick={() => setGroup(null)}
                          className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted/50 text-error"
                        >
                          Remove from group
                        </button>
                      </>
                    )}
                  </div>,
                  document.body
                )}
            </>
          )}
          <DeleteExerciseButton
            exerciseId={exercise.id}
            exerciseName={exercise.name}
            setsCount={exercise.sets.length}
          />
        </div>
      </div>
      <div
        id={`exercise-${exercise.id}`}
        style={{ maxHeight: maxHeight === 0 ? 0 : maxHeight }}
        className="overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out md:duration-300"
      >
        <div
          ref={contentRef}
          className={`transition-opacity duration-200 ease-in-out md:duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}
        >
          <ul className="mb-2 mt-2 space-y-1">
            {exercise.sets.map((s) => (
              <SetRow key={s.id} set={s} />
            ))}
          </ul>
          <AddSetForm
            exerciseId={exercise.id}
            lastSet={exercise.sets.length > 0 ? exercise.sets[exercise.sets.length - 1] : null}
          />
        </div>
      </div>
    </div>
  );
}
