"use client";

import { useEffect, useRef, useState } from "react";
import type { Exercise, Set } from "@prisma/client";
import { formatWeight } from "@/lib/units";
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
}: {
  exercise: ExerciseWithSets;
  isOpen: boolean;
  onToggle: () => void;
  clientId?: string;
  sessionDate?: Date;
  showPreviousBest?: boolean;
}) {
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

  return (
    <div className="rounded border border-border bg-background p-3">
      <div className="sticky top-0 z-[5] flex min-h-[44px] items-center justify-between gap-2 py-3 bg-background -mx-3 px-3 rounded">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`exercise-${exercise.id}`}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 py-3 text-left outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded -my-3"
        >
          <span
            className={`inline-block shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : "rotate-0"}`}
            aria-hidden
          >
            ▶
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-[var(--text)] truncate">{exercise.name}</h4>
            {showPreviousBest && (
              <p className="mt-0.5 text-xs text-muted break-words">
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
            <span className="shrink-0 text-sm text-muted truncate">
              {setsSummary(exercise.sets)}
            </span>
          )}
        </button>
        <DeleteExerciseButton
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          setsCount={exercise.sets.length}
        />
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
