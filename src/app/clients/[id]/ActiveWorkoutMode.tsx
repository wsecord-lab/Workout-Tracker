"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Exercise, Set as PrismaSet } from "@prisma/client";
import { formatWeight, toDisplay } from "@/lib/units";
import { createSet } from "@/app/actions/sets";

type ExerciseWithSets = Exercise & { sets: PrismaSet[] };

// ─── Rest Timer ───────────────────────────────────────────────────────────────

function useRestTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function start() {
    setSeconds(0);
    setRunning(true);
  }

  function reset() {
    setRunning(false);
    setSeconds(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const display = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return { seconds, display, running, start, reset };
}

// ─── Add Set Inline Form ──────────────────────────────────────────────────────

function InlineAddSet({
  exerciseId,
  lastSet,
  setCount,
  onAdded,
}: {
  exerciseId: string;
  lastSet: PrismaSet | null;
  setCount: number;
  onAdded: (newSet: { weightLb: string; reps: string }) => void;
}) {
  const [weight, setWeight] = useState(() =>
    lastSet ? String(toDisplay(lastSet.weightKg, "weight")) : ""
  );
  const [reps, setReps] = useState(() => (lastSet ? String(lastSet.reps) : ""));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("weightLb", weight);
    formData.set("reps", reps);
    startTransition(async () => {
      const result = await createSet(exerciseId, formData);
      if (result.ok) {
        onAdded({ weightLb: weight, reps });
        setWeight(weight); // keep weight pre-filled
        setReps(reps);     // keep reps pre-filled
      } else {
        setError(result.errors.weightLb ?? result.errors.reps ?? result.errors._ ?? "Error");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex items-center gap-2 flex-wrap">
      <input
        type="number"
        step="0.1"
        min="0"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="lb"
        className="input w-20 px-2 py-1.5 text-sm"
        disabled={isPending}
        aria-label="Weight (lb)"
      />
      <input
        type="number"
        min="0"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        placeholder="reps"
        className="input w-16 px-2 py-1.5 text-sm"
        disabled={isPending}
        aria-label="Reps"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        {isPending ? "…" : `Log Set ${setCount + 1}`}
      </button>
      {error && <span className="text-xs text-error">{error}</span>}
    </form>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ActiveWorkoutMode({
  exercises,
  sessionName,
  sessionDate,
  onClose,
}: {
  exercises: ExerciseWithSets[];
  sessionName: string | null;
  sessionDate: Date;
  onClose: () => void;
}) {
  // Track which set IDs have been checked off (local state only)
  const [checked, setChecked] = useState<globalThis.Set<string>>(new globalThis.Set());
  // Live exercise list (we append new sets locally after logging)
  const [liveExercises, setLiveExercises] = useState<ExerciseWithSets[]>(exercises);

  const timer = useRestTimer();

  // Lock body scroll while active
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function toggleSet(setId: string) {
    setChecked((prev: globalThis.Set<string>) => {
      const next = new globalThis.Set(prev);
      if (next.has(setId)) {
        next.delete(setId);
        // If no sets remain checked recently, stop timer
        if (next.size === 0) timer.reset();
      } else {
        next.add(setId);
        timer.start(); // reset & start rest timer on each checkoff
      }
      return next;
    });
  }

  function handleSetAdded(exerciseId: string, info: { weightLb: string; reps: string }) {
    // Optimistically add a placeholder set so the count updates immediately
    setLiveExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        const fakeSet: PrismaSet = {
          id: `tmp-${Date.now()}`,
          exerciseId,
          weightKg: parseFloat(info.weightLb) / 2.20462,
          reps: parseInt(info.reps, 10) || 0,
          rpe: null,
          notes: null,
          orderIndex: ex.sets.length,
          createdAt: new Date(),
        };
        return { ...ex, sets: [...ex.sets, fakeSet] };
      })
    );
    timer.start();
  }

  const totalSets = liveExercises.reduce((s, e) => s + e.sets.length, 0);
  const completedSets = checked.size;

  const dateLabel = new Date(sessionDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const content = (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-background overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 shrink-0">
        <div className="min-w-0">
          <p className="text-xs text-muted">{dateLabel}</p>
          <h2 className="truncate text-base font-semibold text-[var(--text)]">
            {sessionName ?? "Workout"}
          </h2>
        </div>

        {/* Rest timer */}
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted leading-none mb-0.5">Rest Timer</span>
          <span
            className={`font-mono text-xl font-bold tabular-nums ${
              timer.running
                ? timer.seconds >= 90
                  ? "text-amber-500"
                  : "text-primary"
                : "text-muted"
            }`}
          >
            {timer.display}
          </span>
          {timer.running && (
            <button
              type="button"
              onClick={timer.reset}
              className="mt-0.5 text-[10px] text-muted hover:text-[var(--text)] underline"
            >
              reset
            </button>
          )}
        </div>

        {/* Progress + close */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="text-xs text-muted whitespace-nowrap">
            {completedSets}/{totalSets} sets
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-muted/20 outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Finish
          </button>
        </div>
      </div>

      {/* ── Exercise List ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {liveExercises.map((ex) => {
          const setsAsc = [...ex.sets].sort((a, b) => a.orderIndex - b.orderIndex);
          const doneCount = setsAsc.filter((s) => checked.has(s.id)).length;
          const allDone = setsAsc.length > 0 && doneCount === setsAsc.length;

          return (
            <div key={ex.id} className={`rounded-lg border p-4 ${allDone ? "border-green-500/40 bg-green-500/5" : "border-border bg-surface"}`}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className={`font-semibold ${allDone ? "text-green-600 dark:text-green-400" : "text-[var(--text)]"}`}>
                    {ex.name}
                    {allDone && <span className="ml-2 text-sm">✓</span>}
                  </h3>
                  {ex.notes?.trim() && (
                    <p className="text-xs text-muted mt-0.5">{ex.notes}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted whitespace-nowrap">
                  {doneCount}/{setsAsc.length}
                </span>
              </div>

              {/* Existing sets as checkboxes */}
              <div className="space-y-2">
                {setsAsc.map((s, i) => {
                  const done = checked.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSet(s.id)}
                      className={`w-full flex items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                        done
                          ? "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400"
                          : "border-border bg-background hover:border-primary/50"
                      }`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors ${
                        done ? "border-green-500 bg-green-500 text-white" : "border-border"
                      }`}>
                        {done ? "✓" : i + 1}
                      </span>
                      <span className={`flex-1 font-medium ${done ? "line-through opacity-70" : ""}`}>
                        {formatWeight(s.weightKg)} × {s.reps} reps
                        {s.rpe != null && (
                          <span className="ml-2 text-xs font-normal opacity-70">RPE {s.rpe}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Inline add set form */}
              <InlineAddSet
                exerciseId={ex.id}
                lastSet={setsAsc.length > 0 ? setsAsc[setsAsc.length - 1] : null}
                setCount={setsAsc.length}
                onAdded={(info) => handleSetAdded(ex.id, info)}
              />
            </div>
          );
        })}

        {liveExercises.length === 0 && (
          <p className="text-center text-muted text-sm py-8">No exercises in this session yet.</p>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}
