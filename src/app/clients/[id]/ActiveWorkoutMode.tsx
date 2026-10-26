"use client";

import { useState, useEffect, useMemo, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import type { Exercise, Set as PrismaSet } from "@prisma/client";
import { formatWeight, toDisplay, toStorage } from "@/lib/units";
import { formatClock, formatDuration, getElapsedSeconds } from "@/lib/session-duration";
import { createSet, completeSet, uncompleteSet, syncCheckedSets, applySetToRemaining } from "@/app/actions/sets";
import { isCompletedSet, isPlannedOnly, formatPlanVsActual, findSetsToAutofill } from "@/lib/sets";
import { markSessionFinished, getSessionDurationEstimate, pauseSession } from "@/app/actions/sessions";
import { notifyRestDone } from "@/lib/workout-cues";
import { getFinishSkippedCopy } from "@/lib/workout-finish";
import { useWakeLock } from "@/hooks/useWakeLock";
import { WarmupChecklist, type SessionWarmupItem } from "./WarmupChecklist";
import { WarmupDisplay } from "./WarmupSection";

type ExerciseWithSets = Exercise & { sets: PrismaSet[] };
type WarmupBlock = {
  id: string;
  name: string;
  items: { id: string; name: string; details: string | null; orderIndex: number }[];
};
/** What the athlete typed into a planned set's boxes. Blank = use the target. */
type SetDraft = { weight: string; reps: string };
type AutofillOffer = { exerciseId: string; setId: string; weightKg: number; reps: number };

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

// ─── Main Component ───────────────────────────────────────────────────────────

export function ActiveWorkoutMode({
  exercises,
  warmupItems = [],
  warmupBlock = null,
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
  /** The session's own warmup checklist, shown above the exercises. */
  warmupItems?: SessionWarmupItem[];
  /** A trainer-assigned warmup block, shown read-only. */
  warmupBlock?: WarmupBlock | null;
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
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [autofillOffer, setAutofillOffer] = useState<AutofillOffer | null>(null);
  const [, startAutofillTransition] = useTransition();
  /** In-flight completeSet calls, so "apply to rest" can wait for the source set to land. */
  const pendingCompletes = useRef(new Map<string, Promise<unknown>>());
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

  function setDraft(setId: string, field: keyof SetDraft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [setId]: { weight: prev[setId]?.weight ?? "", reps: prev[setId]?.reps ?? "", [field]: value },
    }));
  }

  /** Typed numbers win; a blank box falls back to the target. */
  function resolveDraft(s: PrismaSet): { weightKg: number; reps: number; typed: boolean } {
    const d = drafts[s.id];
    const w = d?.weight.trim() ? parseFloat(d.weight) : NaN;
    const r = d?.reps.trim() ? parseInt(d.reps, 10) : NaN;
    const weightOk = Number.isFinite(w) && w >= 0;
    const repsOk = Number.isInteger(r) && r >= 0;
    return {
      weightKg: weightOk ? toStorage(w, "weight") : s.weightKg,
      reps: repsOk ? r : s.reps,
      typed: weightOk || repsOk,
    };
  }

  function toggleSet(setId: string) {
    if (setId.startsWith("tmp-")) return; // optimistic row, not persisted yet
    const wasChecked = checked.has(setId);
    const target = liveExercises.flatMap((ex) => ex.sets.map((s) => ({ ex, s }))).find(({ s }) => s.id === setId);
    if (!target) return;
    const { ex, s: set } = target;

    const actual = wasChecked ? null : resolveDraft(set);
    const hasPlan = set.plannedWeightKg != null && set.plannedReps != null;

    // Optimistic: the check must feel instant mid-set. The server call follows
    // and router.refresh() reconciles.
    const nextExercises = liveExercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => {
        if (s.id !== setId) return s;
        if (wasChecked) {
          return {
            ...s,
            completedAt: null,
            ...(hasPlan ? { weightKg: s.plannedWeightKg!, reps: s.plannedReps! } : {}),
          };
        }
        return {
          ...s,
          completedAt: new Date(),
          plannedWeightKg: s.plannedWeightKg ?? s.weightKg,
          plannedReps: s.plannedReps ?? s.reps,
          weightKg: actual!.weightKg,
          reps: actual!.reps,
        };
      }),
    }));
    setLiveExercises(nextExercises);

    if (wasChecked) {
      // Put what they actually did back in the boxes so a fix is one edit away.
      const differs = hasPlan && (set.weightKg !== set.plannedWeightKg || set.reps !== set.plannedReps);
      setDrafts((prev) => {
        const next = { ...prev };
        if (differs) next[setId] = { weight: String(toDisplay(set.weightKg, "weight")), reps: String(set.reps) };
        else delete next[setId];
        return next;
      });
      if (autofillOffer?.setId === setId) setAutofillOffer(null);
      if (checked.size <= 1) timer.reset();
    } else {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[setId];
        return next;
      });
      // They did something other than the target: offer to carry it forward.
      const updatedEx = nextExercises.find((e) => e.id === ex.id)!;
      const values = { weightKg: actual!.weightKg, reps: actual!.reps };
      const later = findSetsToAutofill(updatedEx.sets, setId, values);
      setAutofillOffer(actual!.typed && later.length > 0 ? { exerciseId: ex.id, setId, ...values } : null);
      timer.start();
    }

    let fd: FormData | undefined;
    if (actual?.typed) {
      fd = new FormData();
      fd.set("weightLb", String(toDisplay(actual.weightKg, "weight")));
      fd.set("reps", String(actual.reps));
      if (set.rpe != null) fd.set("rpe", String(set.rpe));
      if (set.notes) fd.set("notes", set.notes);
    }
    const call = wasChecked ? uncompleteSet(setId) : completeSet(setId, fd);
    pendingCompletes.current.set(setId, call);
    startToggleTransition(async () => {
      await call;
      if (pendingCompletes.current.get(setId) === call) pendingCompletes.current.delete(setId);
      router.refresh();
    });
  }

  function applyAutofill() {
    const offer = autofillOffer;
    if (!offer) return;
    setAutofillOffer(null);
    setLiveExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== offer.exerciseId) return ex;
        const ids = new globalThis.Set(findSetsToAutofill(ex.sets, offer.setId, offer).map((s) => s.id));
        return {
          ...ex,
          sets: ex.sets.map((s) =>
            ids.has(s.id)
              ? { ...s, weightKg: offer.weightKg, reps: offer.reps, plannedWeightKg: offer.weightKg, plannedReps: offer.reps }
              : s
          ),
        };
      })
    );
    startAutofillTransition(async () => {
      await pendingCompletes.current.get(offer.setId);
      await applySetToRemaining(offer.setId);
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
        {warmupBlock && <WarmupDisplay block={warmupBlock} />}
        <WarmupChecklist sessionId={sessionId} items={warmupItems} variant="workout" />
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
                  const planned = isPlannedOnly(s);
                  const planNote = formatPlanVsActual(s);
                  const draft = drafts[s.id];
                  const offer = autofillOffer?.setId === s.id ? autofillOffer : null;
                  const offerCount = offer
                    ? findSetsToAutofill(setsAsc, s.id, offer).length
                    : 0;

                  return (
                    <div key={s.id}>
                    <div className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors ${
                      done
                        ? "border-green-500/50 bg-green-500/10"
                        : "border-dashed border-muted/60 bg-background"
                    }`}>
                      {/* Check circle */}
                      <button type="button" onClick={() => toggleSet(s.id)}
                        aria-label={done ? `Uncheck set ${i + 1}` : `Mark set ${i + 1} done`}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                          done
                            ? "border-green-500 bg-green-500 text-white"
                            : "border-dashed border-muted text-muted hover:border-primary/70"
                        }`}>
                        {done ? "✓" : i + 1}
                      </button>

                      {planned ? (
                        // Not done yet: empty boxes to fill in, target shown faintly.
                        // Checking off with the boxes blank logs the target.
                        <div className="flex flex-1 items-center gap-1.5 min-w-0">
                          <input
                            type="number" inputMode="decimal" step="0.1" min="0"
                            value={draft?.weight ?? ""}
                            onChange={(e) => setDraft(s.id, "weight", e.target.value)}
                            placeholder={`${toDisplay(s.weightKg, "weight")} lb`}
                            aria-label={`Set ${i + 1} weight (lb), target ${toDisplay(s.weightKg, "weight")}`}
                            className="input w-24 px-2 py-1.5 text-sm placeholder:italic placeholder:opacity-50"
                          />
                          <span className="text-muted">×</span>
                          <input
                            type="number" inputMode="numeric" step="1" min="0"
                            value={draft?.reps ?? ""}
                            onChange={(e) => setDraft(s.id, "reps", e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); toggleSet(s.id); } }}
                            placeholder={`${s.reps} reps`}
                            aria-label={`Set ${i + 1} reps, target ${s.reps}`}
                            className="input w-24 px-2 py-1.5 text-sm placeholder:italic placeholder:opacity-50"
                          />
                        </div>
                      ) : (
                        <span
                          role="button"
                          onClick={() => toggleSet(s.id)}
                          className="flex-1 cursor-pointer font-medium text-green-700 dark:text-green-400"
                        >
                          <span className="line-through opacity-70">{formatWeight(s.weightKg)} × {s.reps} reps</span>
                          {s.rpe != null && <span className="ml-2 text-xs font-normal opacity-70">RPE {s.rpe}</span>}
                          {planNote && (
                            <span className="block text-xs font-normal text-amber-600 dark:text-amber-400">
                              {planNote}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    {offer && offerCount > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
                        <span className="flex-1 text-[var(--text)]">
                          Use {formatWeight(offer.weightKg)} × {offer.reps} for the
                          {offerCount === 1 ? " next set" : ` remaining ${offerCount} sets`}?
                        </span>
                        <button type="button" onClick={applyAutofill}
                          className="rounded bg-primary px-3 py-1.5 font-medium text-white hover:bg-primary-hover">
                          Apply
                        </button>
                        <button type="button" onClick={() => setAutofillOffer(null)}
                          className="rounded px-2 py-1.5 text-muted hover:text-[var(--text)]" aria-label="Dismiss">
                          ✕
                        </button>
                      </div>
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
