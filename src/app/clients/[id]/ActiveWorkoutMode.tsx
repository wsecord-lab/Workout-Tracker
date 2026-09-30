"use client";

import { useState, useEffect, useMemo, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import type { Exercise, Set as PrismaSet } from "@prisma/client";
import { formatWeight, toDisplay, toStorage } from "@/lib/units";
import { formatClock, formatDuration, getElapsedSeconds } from "@/lib/session-duration";
import { createSet, updateSet, completeSet, uncompleteSet, syncCheckedSets } from "@/app/actions/sets";
import { isCompletedSet, isPlannedOnly, formatPlanVsActual } from "@/lib/sets";
import { markSessionFinished, getSessionDurationEstimate, pauseSession } from "@/app/actions/sessions";
import { notifyRestDone } from "@/lib/workout-cues";
import { getFinishSkippedCopy } from "@/lib/workout-finish";
import { useWakeLock } from "@/hooks/useWakeLock";

type ExerciseWithSets = Exercise & { sets: PrismaSet[] };

const TIMER_KEY = "workout_timer_v1";
const IN_PROGRESS_KEY = "workout_in_progress";
const PRESETS = [60, 90, 120, 180, 300] as const;

function formatPreset(s: number) {
  if (s % 60 === 0) return `${s / 60}m`;
  return `${s}s`;
}

// ─── Countdown Timer Hook ─────────────────────────────────────────────────────

function useRestTimer(onComplete?: () => void) {
  const [duration, setDuration] = useState(90);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  /** Prevents double-firing vibrate/beep if tick and visibility both see expiry. */
  const cuedRef = useRef(false);

  function markDone(cue: boolean) {
    setRunning(false);
    setDone(true);
    try {
      localStorage.removeItem(TIMER_KEY);
    } catch {
      /* ignore */
    }
    if (cue && !cuedRef.current) {
      cuedRef.current = true;
      onCompleteRef.current?.();
    }
  }

  // Restore timer on mount (persists across page navigations).
  // Already-expired restores show the banner but do not re-cue.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TIMER_KEY);
      if (!raw) return;
      const { startedAt, duration: dur } = JSON.parse(raw) as { startedAt: number; duration: number };
      const rem = dur - Math.floor((Date.now() - startedAt) / 1000);
      if (rem > 0) {
        setDuration(dur);
        setRemaining(rem);
        setRunning(true);
      } else {
        markDone(false);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only restore
  }, []);

  // Snap to correct remaining time when tab regains focus
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      try {
        const raw = localStorage.getItem(TIMER_KEY);
        if (!raw) return;
        const { startedAt, duration: dur } = JSON.parse(raw) as { startedAt: number; duration: number };
        const rem = Math.max(0, dur - Math.floor((Date.now() - startedAt) / 1000));
        setRemaining(rem);
        if (rem === 0) markDone(true);
      } catch {
        /* ignore */
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable listeners; markDone closes over cuedRef
  }, []);

  // Tick down every second
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          markDone(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function start(dur?: number) {
    const d = dur ?? duration;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    cuedRef.current = false;
    setDuration(d);
    setRemaining(d);
    setDone(false);
    setRunning(true);
    localStorage.setItem(TIMER_KEY, JSON.stringify({ startedAt: Date.now(), duration: d }));
  }

  function reset() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    cuedRef.current = false;
    setRunning(false);
    setDone(false);
    setRemaining(0);
    localStorage.removeItem(TIMER_KEY);
  }

  const display = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  return { remaining, display, running, done, duration, setDuration, start, reset };
}

// ─── Inline Add Set Form ──────────────────────────────────────────────────────

function InlineAddSet({ exerciseId, lastSet, setCount, onAdded }: {
  exerciseId: string;
  lastSet: PrismaSet | null;
  setCount: number;
  onAdded: (info: { weightLb: string; reps: string }) => void;
}) {
  const [weight, setWeight] = useState(() => lastSet ? String(toDisplay(lastSet.weightKg, "weight")) : "");
  const [reps, setReps] = useState(() => lastSet ? String(lastSet.reps) : "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("weightLb", weight); fd.set("reps", reps);
    startTransition(async () => {
      const result = await createSet(exerciseId, fd);
      if (result.ok) { onAdded({ weightLb: weight, reps }); }
      else { setError(result.errors.weightLb ?? result.errors.reps ?? result.errors._ ?? "Error"); }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex items-center gap-2 flex-wrap">
      <input type="number" step="0.1" min="0" value={weight} onChange={e => setWeight(e.target.value)}
        placeholder="lb" className="input w-20 px-2 py-1.5 text-sm" disabled={isPending} aria-label="Weight (lb)" />
      <input type="number" min="0" value={reps} onChange={e => setReps(e.target.value)}
        placeholder="reps" className="input w-16 px-2 py-1.5 text-sm" disabled={isPending} aria-label="Reps" />
      <button type="submit" disabled={isPending}
        className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
        {isPending ? "…" : `Log Set ${setCount + 1}`}
      </button>
      {error && <span className="text-xs text-error">{error}</span>}
    </form>
  );
}

// ─── Inline Edit Set Form ─────────────────────────────────────────────────────

function InlineEditSet({ set, onSaved, onCancel }: {
  set: PrismaSet;
  onSaved: (updated: { weightKg: number; reps: number }) => void;
  onCancel: () => void;
}) {
  const [weight, setWeight] = useState(String(toDisplay(set.weightKg, "weight")));
  const [reps, setReps] = useState(String(set.reps));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("weightLb", weight); fd.set("reps", reps);
    if (set.rpe != null) fd.set("rpe", String(set.rpe));
    if (set.notes) fd.set("notes", set.notes);
    startTransition(async () => {
      const result = await updateSet(set.id, fd);
      if (result.ok) { onSaved({ weightKg: parseFloat(weight) / 2.20462, reps: parseInt(reps, 10) || 0 }); }
      else { setError(result.errors.weightLb ?? result.errors.reps ?? result.errors._ ?? "Error"); }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-wrap">
      <input type="number" step="0.1" min="0" value={weight} onChange={e => setWeight(e.target.value)}
        placeholder="lb" className="input w-20 px-2 py-1.5 text-sm" disabled={isPending} autoFocus />
      <input type="number" min="0" value={reps} onChange={e => setReps(e.target.value)}
        placeholder="reps" className="input w-16 px-2 py-1.5 text-sm" disabled={isPending} />
      <button type="submit" disabled={isPending}
        className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50">
        {isPending ? "…" : "Save"}
      </button>
      <button type="button" onClick={onCancel} disabled={isPending}
        className="rounded border border-border px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-muted/20">
        Cancel
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
  sessionId,
  clientId,
  startedAt,
  totalPausedSeconds = 0,
  onPause,
  onFinish,
}: {
  exercises: ExerciseWithSets[];
  sessionName: string | null;
  sessionDate: Date;
  sessionId: string;
  clientId: string;
  /** When the workout clock started. Null only if startSession hasn't landed yet. */
  startedAt: Date | string | null;
  /** Completed pause windows already folded into the DB. Open pause is not active in this UI. */
  totalPausedSeconds?: number;
  /** Persists pause + exits active mode back to the session editor. */
  onPause: () => void;
  onFinish: () => void;
}) {
  const router = useRouter();
  const [liveExercises, setLiveExercises] = useState<ExerciseWithSets[]>(exercises);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [isFinishing, startFinishTransition] = useTransition();
  const [isPausing, startPauseTransition] = useTransition();
  const [, startToggleTransition] = useTransition();
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);

  // Completion lives in the database now, so it survives a device switch and the
  // trainer can see it. Derived, never stored separately.
  const checked = useMemo(
    () =>
      new globalThis.Set(
        liveExercises.flatMap((ex) => ex.sets.filter(isCompletedSet).map((s) => s.id))
      ),
    [liveExercises]
  );

  // Re-seed from the server after a refresh confirms our optimistic writes.
  useEffect(() => { setLiveExercises(exercises); }, [exercises]);

  // One-shot migration off the old localStorage check state. Runs before the
  // user can touch anything, and is a no-op once the key is gone.
  useEffect(() => {
    const checkedKey = `workout_checked_${sessionId}`;
    let ids: string[] = [];
    try {
      const raw = localStorage.getItem(checkedKey);
      ids = raw ? (JSON.parse(raw) as string[]) : [];
    } catch { return; }
    if (ids.length === 0) {
      try { localStorage.removeItem(checkedKey); } catch { /* ignore */ }
      return;
    }
    syncCheckedSets(sessionId, ids).then(() => {
      try { localStorage.removeItem(checkedKey); } catch { /* ignore */ }
      router.refresh();
    });
  }, [sessionId, router]);

  useWakeLock(true);

  const timer = useRestTimer(() => {
    void notifyRestDone();
  });

  // Live elapsed clock. Recomputed from startedAt rather than incremented, so
  // it stays correct after the phone sleeps or the tab is backgrounded.
  // Pause windows (totalPausedSeconds) are subtracted so time spent editing
  // outside active mode does not inflate "time under workout".
  const [elapsed, setElapsed] = useState(() =>
    startedAt ? getElapsedSeconds(startedAt, new Date(), { totalPausedSeconds }) : 0
  );
  useEffect(() => {
    if (!startedAt) return;
    const tick = () =>
      setElapsed(getElapsedSeconds(startedAt, new Date(), { totalPausedSeconds }));
    tick();
    const id = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [startedAt, totalPausedSeconds]);

  // Pacing estimate from past workouts of the same name.
  const [estimateSeconds, setEstimateSeconds] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    getSessionDurationEstimate(sessionId, clientId).then((r) => {
      if (!cancelled) setEstimateSeconds(r.averageSeconds);
    });
    return () => { cancelled = true; };
  }, [sessionId, clientId]);

  // Mark session in-progress in localStorage
  useEffect(() => {
    try { localStorage.setItem(IN_PROGRESS_KEY, sessionId); } catch { /* ignore */ }
  }, [sessionId]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function toggleSet(setId: string) {
    if (setId.startsWith("tmp-")) return; // optimistic row, not persisted yet
    const wasChecked = checked.has(setId);

    // Optimistic: the check must feel instant mid-set. The server call follows
    // and router.refresh() reconciles.
    setLiveExercises((prev) =>
      prev.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) =>
          s.id === setId
            ? {
                ...s,
                completedAt: wasChecked ? null : new Date(),
                ...(wasChecked && s.plannedWeightKg != null && s.plannedReps != null
                  ? { weightKg: s.plannedWeightKg, reps: s.plannedReps }
                  : {}),
              }
            : s
        ),
      }))
    );

    if (wasChecked) {
      if (checked.size <= 1) timer.reset();
    } else {
      timer.start();
    }

    startToggleTransition(async () => {
      if (wasChecked) await uncompleteSet(setId);
      else await completeSet(setId);
      router.refresh();
    });
  }

  function handleSetAdded(exerciseId: string, info: { weightLb: string; reps: string }) {
    setLiveExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        const fakeSet: PrismaSet = {
          id: `tmp-${Date.now()}`,
          exerciseId,
          weightKg: toStorage(parseFloat(info.weightLb) || 0, "weight"),
          reps: parseInt(info.reps, 10) || 0,
          rpe: null, notes: null,
          orderIndex: ex.sets.length,
          createdAt: new Date(),
          // Logged live in workout mode, so it counts as done. Mirrors createSet.
          plannedWeightKg: null,
          plannedReps: null,
          completedAt: new Date(),
        };
        return { ...ex, sets: [...ex.sets, fakeSet] };
      })
    );
    timer.start();
  }

  function handleSetSaved(exerciseId: string, setId: string, updated: { weightKg: number; reps: number }) {
    setLiveExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exerciseId) return ex;
        return { ...ex, sets: ex.sets.map((s) => s.id === setId ? { ...s, ...updated } : s) };
      })
    );
    setEditingSetId(null);
  }

  function handlePause() {
    startPauseTransition(async () => {
      // Clear rest countdown so it does not keep running while the user edits
      // the session outside active mode (misleading "rest done" later).
      timer.reset();
      setFinishConfirmOpen(false);
      try {
        localStorage.removeItem(IN_PROGRESS_KEY);
      } catch { /* ignore */ }
      await pauseSession(sessionId, clientId);
      onPause();
    });
  }

  function requestFinish() {
    const skipped = totalSets - completedSets;
    if (skipped > 0) {
      setFinishConfirmOpen(true);
      return;
    }
    commitFinish();
  }

  function commitFinish() {
    setFinishConfirmOpen(false);
    startFinishTransition(async () => {
      await markSessionFinished(sessionId, clientId);
      try {
        localStorage.removeItem(IN_PROGRESS_KEY);
        localStorage.removeItem(TIMER_KEY);
      } catch { /* ignore */ }
      onFinish();
    });
  }

  const totalSets = liveExercises.reduce((s, e) => s + e.sets.length, 0);
  const completedSets = checked.size;
  const skippedSets = totalSets - completedSets;
  const finishSkippedCopy =
    skippedSets > 0 ? getFinishSkippedCopy(skippedSets, completedSets, totalSets) : null;
  const dateLabel = new Date(sessionDate).toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric",
  });

  const finishModal =
    finishConfirmOpen &&
    finishSkippedCopy &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-black/50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-skipped-title"
        aria-describedby="finish-skipped-desc"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isFinishing) setFinishConfirmOpen(false);
        }}
      >
        <div
          className="rounded-lg border border-border bg-background p-5 shadow-lg max-w-md w-full space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="finish-skipped-title" className="text-lg font-semibold text-[var(--text)]">
            {finishSkippedCopy.title}
          </h2>
          <p
            id="finish-skipped-desc"
            className="text-sm text-muted leading-relaxed whitespace-pre-line"
          >
            {finishSkippedCopy.body}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 pt-1">
            <button
              type="button"
              onClick={() => setFinishConfirmOpen(false)}
              disabled={isFinishing}
              className="tap-target btn-secondary text-sm py-2 px-4 rounded focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              {finishSkippedCopy.cancelLabel}
            </button>
            <button
              type="button"
              onClick={commitFinish}
              disabled={isFinishing}
              className="tap-target rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 outline-none focus:ring-2 focus:ring-green-500"
            >
              {isFinishing ? "Finishing…" : finishSkippedCopy.confirmLabel}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  const content = (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-background overflow-hidden">

      {/* ── Timer-done flash banner ── */}
      {timer.done && (
        <div className="shrink-0 flex items-center justify-center gap-2 bg-green-500 px-4 py-2.5 text-white font-semibold text-sm animate-pulse">
          <span className="text-base">🔔</span>
          Rest done — start your next set!
          <button type="button" onClick={timer.reset}
            className="ml-3 rounded border border-white/40 px-2 py-0.5 text-xs font-normal hover:bg-white/10">
            dismiss
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 shrink-0">
        {/* Session info */}
        <div className="min-w-0">
          <p className="text-xs text-muted">{dateLabel}</p>
          <h2 className="truncate text-base font-semibold text-[var(--text)]">{sessionName ?? "Workout"}</h2>
          <p className="flex items-baseline gap-1.5 text-xs text-muted">
            <span className="font-mono tabular-nums text-[var(--text)]">{formatClock(elapsed)}</span>
            {estimateSeconds != null && <span>· avg {formatDuration(estimateSeconds)}</span>}
          </p>
        </div>

        {/* Countdown timer */}
        <div className="flex flex-col items-center gap-1 min-w-0">
          {timer.running ? (
            <>
              <span className="text-xs text-muted leading-none">Rest</span>
              <span className={`font-mono text-xl font-bold tabular-nums ${
                timer.remaining <= 10
                  ? "text-red-500 animate-pulse"
                  : timer.remaining <= 30
                  ? "text-amber-500"
                  : "text-primary"
              }`}>
                {timer.display}
              </span>
              <button type="button" onClick={timer.reset}
                className="text-[10px] text-muted hover:text-[var(--text)] underline">
                reset
              </button>
            </>
          ) : (
            <>
              <span className="text-xs text-muted leading-none mb-0.5">Rest</span>
              <div className="flex gap-1">
                {PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => timer.setDuration(p)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ${
                      timer.duration === p
                        ? "bg-primary text-white border-primary"
                        : "border-border text-muted hover:border-primary/50"
                    }`}>
                    {formatPreset(p)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Progress + actions */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="text-xs text-muted whitespace-nowrap text-right">
            {completedSets}/{totalSets} sets
            {skippedSets > 0 ? (
              <span className="block text-amber-600 dark:text-amber-400">
                {skippedSets} unchecked
              </span>
            ) : null}
          </span>
          <div className="flex gap-1.5">
            <button type="button" onClick={handlePause} disabled={isPausing || isFinishing}
              className="rounded border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:text-[var(--text)] hover:bg-muted/20 outline-none focus:ring-2 focus:ring-primary disabled:opacity-50">
              {isPausing ? "…" : "Pause"}
            </button>
            <button type="button" onClick={requestFinish} disabled={isFinishing || isPausing}
              className="rounded bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 outline-none focus:ring-2 focus:ring-green-500">
              {isFinishing ? "…" : skippedSets > 0 ? `Finish (${skippedSets} left)` : "Finish ✓"}
            </button>
          </div>
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
                    {ex.name}{allDone && <span className="ml-2 text-sm">✓</span>}
                  </h3>
                  {ex.notes?.trim() && <p className="text-xs text-muted mt-0.5">{ex.notes}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted whitespace-nowrap">{doneCount}/{setsAsc.length}</span>
              </div>

              <div className="space-y-2">
                {setsAsc.map((s, i) => {
                  const done = checked.has(s.id);
                  const isTemp = s.id.startsWith("tmp-");
                  const isEditing = editingSetId === s.id;

                  if (isEditing && !isTemp) {
                    return (
                      <div key={s.id} className="rounded-md border border-primary/50 bg-primary/5 px-3 py-2.5">
                        <InlineEditSet
                          set={s}
                          onSaved={(updated) => handleSetSaved(ex.id, s.id, updated)}
                          onCancel={() => setEditingSetId(null)}
                        />
                      </div>
                    );
                  }

                  const planned = isPlannedOnly(s);
                  const planNote = formatPlanVsActual(s);

                  return (
                    <div key={s.id} className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors ${
                      done
                        ? "border-green-500/50 bg-green-500/10"
                        : planned
                        ? "border-dashed border-muted/60 bg-background"
                        : "border-border bg-background"
                    }`}>
                      {/* Check circle */}
                      <button type="button" onClick={() => toggleSet(s.id)}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors ${
                          done
                            ? "border-green-500 bg-green-500 text-white"
                            : planned
                            ? "border-dashed border-muted text-muted hover:border-primary/70"
                            : "border-border hover:border-primary/70"
                        }`}>
                        {done ? "✓" : i + 1}
                      </button>

                      {/* Set details */}
                      <span
                        role="button"
                        onClick={() => toggleSet(s.id)}
                        className={`flex-1 cursor-pointer font-medium ${
                          done
                            ? "text-green-700 dark:text-green-400 line-through opacity-70"
                            : planned
                            ? "text-muted"
                            : "text-[var(--text)]"
                        }`}
                      >
                        {formatWeight(s.weightKg)} × {s.reps} reps
                        {planned && <span className="ml-2 text-xs font-normal italic">target</span>}
                        {s.rpe != null && <span className="ml-2 text-xs font-normal opacity-70">RPE {s.rpe}</span>}
                        {planNote && (
                          <span className="block text-xs font-normal text-amber-600 dark:text-amber-400 no-underline">
                            {planNote}
                          </span>
                        )}
                      </span>

                      {/* Edit button (real sets only, not yet checked off) */}
                      {!isTemp && !done && (
                        <button type="button" onClick={() => setEditingSetId(s.id)}
                          className="shrink-0 text-muted hover:text-[var(--text)] transition-colors p-0.5 rounded text-base leading-none"
                          aria-label="Edit set">
                          ✎
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <InlineAddSet
                exerciseId={ex.id}
                lastSet={[...setsAsc].reverse().find(isCompletedSet) ?? (setsAsc.length > 0 ? setsAsc[setsAsc.length - 1] : null)}
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

  return typeof document !== "undefined" ? (
    <>
      {createPortal(content, document.body)}
      {finishModal}
    </>
  ) : null;
}
