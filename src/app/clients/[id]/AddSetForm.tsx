"use client";

import React, { useTransition, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSet, createSetsBulk } from "@/app/actions/sets";
import { toDisplay } from "@/lib/units";
import type { Set } from "@prisma/client";

function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

const RPE_OPTIONS: (number | "")[] = [
  "",
  ...Array.from({ length: 19 }, (_, i) => 1 + i * 0.5),
];

type BulkRow = { weightLb: string; reps: string; rpe: string; notes: string };

function emptyRow(): BulkRow {
  return { weightLb: "", reps: "", rpe: "", notes: "" };
}

function lastSetToRow(set: Set): BulkRow {
  return {
    weightLb: String(toDisplay(set.weightKg, "weight")),
    reps: String(set.reps),
    rpe: set.rpe != null ? String(set.rpe) : "",
    notes: set.notes ?? "",
  };
}

export function AddSetForm({
  exerciseId,
  lastSet = null,
  setCount = 0,
}: {
  exerciseId: string;
  lastSet?: Set | null;
  setCount?: number;
}) {
  const router = useRouter();
  const [weight, setWeight] = useState(() =>
    lastSet ? String(toDisplay(lastSet.weightKg, "weight")) : ""
  );
  const [reps, setReps] = useState(() =>
    lastSet ? String(lastSet.reps) : ""
  );
  const [rpe, setRpe] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const singleSetFormRef = useRef<HTMLFormElement>(null);
  const scrollToNewSetRef = useRef(false);

  const [numBulkSets, setNumBulkSets] = useState(1);
  const [copyFromPrevious, setCopyFromPrevious] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>(() => [
    lastSet ? lastSetToRow(lastSet) : emptyRow(),
  ]);
  const [bulkErrors, setBulkErrors] = useState<Record<string, string>>({});
  const [repeatCountStr, setRepeatCountStr] = useState("3");

  useEffect(() => {
    const n = Math.max(1, Math.min(10, numBulkSets));
    setBulkRows((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) {
        const base = copyFromPrevious && lastSet && next.length === 0
          ? lastSetToRow(lastSet)
          : next.length > 0
            ? { ...next[next.length - 1] }
            : emptyRow();
        next.push(base);
      }
      return next;
    });
  }, [numBulkSets, copyFromPrevious, lastSet]);

  useEffect(() => {
    if (copyFromPrevious && lastSet && bulkRows.length > 0) {
      const row = lastSetToRow(lastSet);
      setBulkRows((prev) => prev.map(() => ({ ...row })));
    }
  }, [copyFromPrevious, lastSet]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const formData = new FormData();
    formData.set("weightLb", weight);
    formData.set("reps", reps);
    if (rpe !== "") formData.set("rpe", String(rpe));
    if (notes.trim()) formData.set("notes", notes.trim());
    startTransition(async () => {
      const result = await createSet(exerciseId, formData);
      if (result.ok) {
        // Keep weight & reps so the next set starts pre-filled
        setRpe("");
        setNotes("");
        setErrors({});
        scrollToNewSetRef.current = true;
        router.refresh();
        return;
      }
      setErrors(result.errors);
    });
  }

  useEffect(() => {
    if (!scrollToNewSetRef.current || !lastSet?.id) return;
    const t = setTimeout(() => {
      const formEl = singleSetFormRef.current;
      const wrapper = formEl?.parentElement;
      const ul = wrapper?.previousElementSibling;
      if (ul?.tagName === "UL") {
        const lastLi = ul.lastElementChild;
        if (lastLi instanceof HTMLElement) {
          lastLi.scrollIntoView({ behavior: "smooth", block: "nearest" });
          lastLi.classList.add("ring-2", "ring-primary/60", "ring-offset-2", "rounded");
          const clearHighlight = () => {
            lastLi.classList.remove("ring-2", "ring-primary/60", "ring-offset-2", "rounded");
          };
          window.setTimeout(clearHighlight, 1800);
        }
      }
      scrollToNewSetRef.current = false;
    }, 120);
    return () => clearTimeout(t);
  }, [lastSet?.id]);

  function updateBulkRow(i: number, field: keyof BulkRow, value: string) {
    setBulkRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBulkErrors({});
    const payload = bulkRows.slice(0, numBulkSets).map((r) => ({
      weight: r.weightLb.trim() === "" ? 0 : parseFloat(r.weightLb) || 0,
      reps: r.reps.trim() === "" ? 0 : parseInt(r.reps, 10) || 0,
      rpe: r.rpe.trim() === "" ? null : (parseFloat(r.rpe) || null),
      notes: r.notes.trim() || null,
    }));
    const formData = new FormData();
    formData.set("exerciseId", exerciseId);
    formData.set("setsJson", JSON.stringify(payload));
    startTransition(async () => {
      const result = await createSetsBulk(formData);
      if (result.ok) {
        setBulkRows([lastSet ? lastSetToRow(lastSet) : emptyRow()]);
        setNumBulkSets(1);
        router.refresh();
        return;
      }
      setBulkErrors(result.errors);
    });
  }

  function handleRepeatLast(e: React.FormEvent) {
    e.preventDefault();
    if (!lastSet) return;
    const n = Math.max(1, Math.min(10, parseInt(repeatCountStr, 10) || 1));
    const row = lastSetToRow(lastSet);
    const payload = Array.from({ length: n }, () => ({
      weight: row.weightLb === "" ? 0 : parseFloat(row.weightLb) || 0,
      reps: row.reps === "" ? 0 : parseInt(row.reps, 10) || 0,
      rpe: row.rpe === "" ? null : (parseFloat(row.rpe) || null),
      notes: row.notes.trim() || null,
    }));
    const formData = new FormData();
    formData.set("exerciseId", exerciseId);
    formData.set("setsJson", JSON.stringify(payload));
    setBulkErrors({});
    startTransition(async () => {
      const result = await createSetsBulk(formData);
      if (result.ok) {
        router.refresh();
        return;
      }
      setBulkErrors(result.errors);
    });
  }

  function handleRepeatOnce() {
    if (!lastSet) return;
    const row = lastSetToRow(lastSet);
    const payload = [{
      weight: row.weightLb === "" ? 0 : parseFloat(row.weightLb) || 0,
      reps: row.reps === "" ? 0 : parseInt(row.reps, 10) || 0,
      rpe: row.rpe === "" ? null : (parseFloat(row.rpe) || null),
      notes: row.notes.trim() || null,
    }];
    const formData = new FormData();
    formData.set("exerciseId", exerciseId);
    formData.set("setsJson", JSON.stringify(payload));
    setBulkErrors({});
    startTransition(async () => {
      const result = await createSetsBulk(formData);
      if (result.ok) router.refresh();
      else setBulkErrors(result.errors);
    });
  }

  const displayRows = bulkRows.slice(0, Math.max(1, Math.min(10, numBulkSets)));

  const nextSetNum = setCount + 1;

  return (
    <div className="mt-2 space-y-2">
      {/* ── Quick-add (hero) ── */}
      <form ref={singleSetFormRef} onSubmit={handleSubmit} className="rounded border border-border bg-background/40 p-3 space-y-2 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Add Set {nextSetNum}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-2">
          <div>
            <label htmlFor={`weight-${exerciseId}`} className="mb-0.5 block text-xs font-medium text-muted">Weight (lb)</label>
            <input
              id={`weight-${exerciseId}`}
              type="number"
              step="0.1"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="0"
              className="input w-full sm:w-20 min-h-[44px] sm:min-h-0 px-2 py-1 text-sm"
              disabled={isPending}
            />
            {errors.weightLb && <p className="text-xs text-error">{errors.weightLb}</p>}
          </div>
          <div>
            <label htmlFor={`reps-${exerciseId}`} className="mb-0.5 block text-xs font-medium text-muted">Reps</label>
            <input
              id={`reps-${exerciseId}`}
              type="number"
              min="0"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              placeholder="0"
              className="input w-full sm:w-16 min-h-[44px] sm:min-h-0 px-2 py-1 text-sm"
              disabled={isPending}
            />
            {errors.reps && <p className="text-xs text-error">{errors.reps}</p>}
          </div>
          <div>
            <label htmlFor={`rpe-num-${exerciseId}`} className="mb-0.5 block text-xs font-medium text-muted sm:hidden">RPE</label>
            <label htmlFor={`rpe-${exerciseId}`} className="mb-0.5 hidden text-xs font-medium text-muted sm:block">RPE</label>
            <input
              id={`rpe-num-${exerciseId}`}
              type="number"
              min={1}
              max={10}
              step={0.5}
              value={rpe === "" ? "" : rpe}
              onChange={(e) => { const v = e.target.value; setRpe(v === "" ? "" : Number(v)); }}
              placeholder="—"
              className="input w-full sm:w-16 min-h-[44px] sm:min-h-0 px-2 py-1 text-sm sm:hidden"
              disabled={isPending}
              aria-label="RPE"
            />
            <select
              id={`rpe-${exerciseId}`}
              value={rpe === "" ? "" : rpe}
              onChange={(e) => setRpe(e.target.value === "" ? "" : Number(e.target.value))}
              className="input w-16 px-2 py-1 text-sm hidden sm:block min-h-[44px] lg:min-h-0"
              disabled={isPending}
            >
              {RPE_OPTIONS.map((v) => (
                <option key={v === "" ? "blank" : v} value={v === "" ? "" : v}>
                  {v === "" ? "—" : v}
                </option>
              ))}
            </select>
            {errors.rpe && <p className="text-xs text-error">{errors.rpe}</p>}
          </div>
          <div className="col-span-2 sm:col-span-1 sm:flex-1 sm:min-w-[100px]">
            <label htmlFor={`notes-${exerciseId}`} className="mb-0.5 block text-xs font-medium text-muted">Notes</label>
            <input
              id={`notes-${exerciseId}`}
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder=""
              className="input w-full min-h-[44px] sm:min-h-0 px-2 py-1 text-sm"
              disabled={isPending}
            />
            {errors.notes && <p className="text-xs text-error">{errors.notes}</p>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="submit"
            disabled={isPending}
            className="tap-target flex-1 rounded bg-primary px-3 py-2 text-sm font-medium text-white outline-none hover:bg-primary-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center gap-1.5 min-w-[100px]"
          >
            {isPending ? <><Spinner /><span>Saving…</span></> : `Log Set ${nextSetNum}`}
          </button>
          {lastSet && (
            <button
              type="button"
              onClick={handleRepeatOnce}
              disabled={isPending}
              className="tap-target inline-flex items-center gap-1.5 rounded-full border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              ↻ Repeat last
            </button>
          )}
        </div>
        {errors._ && <p className="text-xs text-error">{errors._}</p>}
      </form>

      {/* ── Bulk section (collapsed by default) ── */}
      <div>
        <button
          type="button"
          onClick={() => setShowBulk((s) => !s)}
          className="flex items-center gap-1 text-xs text-muted hover:text-[var(--text)] outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded transition-colors"
        >
          <span aria-hidden>{showBulk ? "▲" : "▼"}</span>
          {showBulk ? "Hide Multiple Sets" : "Add Multiple Sets At Once"}
        </button>

        {showBulk && (
          <div className="mt-2 rounded border border-border bg-background/50 p-3 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 text-sm">
              <label className="flex items-center gap-2 tap-target">
                <span className="text-muted">Number Of Sets</span>
                <select
                  value={numBulkSets}
                  onChange={(e) => setNumBulkSets(Number(e.target.value))}
                  className="input w-16 min-h-[44px] sm:min-h-0 py-1 text-sm"
                  disabled={isPending}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              {lastSet && (
                <label className="flex items-center gap-2 text-muted min-h-[44px] sm:min-h-0 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={copyFromPrevious}
                    onChange={(e) => setCopyFromPrevious(e.target.checked)}
                    className="h-5 w-5 rounded border-border text-primary focus:ring-primary shrink-0"
                    disabled={isPending}
                  />
                  Copy Values From Previous Set
                </label>
              )}
            </div>
            <form onSubmit={handleBulkSubmit} className="space-y-2">
              <div className="overflow-x-auto -mx-1">
                <div className="grid min-w-[400px] grid-cols-[auto_1fr_1fr_1fr_2fr] gap-2 text-sm md:grid-cols-[auto_80px_70px_70px_1fr]">
                  <div className="font-medium text-muted">Set #</div>
                  <div className="font-medium text-muted">Weight</div>
                  <div className="font-medium text-muted">Reps</div>
                  <div className="font-medium text-muted">RPE</div>
                  <div className="font-medium text-muted">Notes</div>
                  {displayRows.map((row, i) => (
                    <React.Fragment key={i}>
                      <div className="flex items-center text-muted">{i + 1}</div>
                      <div>
                        <input type="number" step="0.1" min={0} value={row.weightLb} onChange={(e) => updateBulkRow(i, "weightLb", e.target.value)} placeholder="lb" className="input w-full px-1.5 py-0.5 text-sm" disabled={isPending} />
                        {bulkErrors[`sets.${i}.weight`] && <p className="text-xs text-error">{bulkErrors[`sets.${i}.weight`]}</p>}
                      </div>
                      <div>
                        <input type="number" min={0} step={1} value={row.reps} onChange={(e) => updateBulkRow(i, "reps", e.target.value)} placeholder="reps" className="input w-full px-1.5 py-0.5 text-sm" disabled={isPending} />
                        {bulkErrors[`sets.${i}.reps`] && <p className="text-xs text-error">{bulkErrors[`sets.${i}.reps`]}</p>}
                      </div>
                      <div>
                        <select value={row.rpe} onChange={(e) => updateBulkRow(i, "rpe", e.target.value)} className="input w-full px-1.5 py-0.5 text-sm" disabled={isPending}>
                          {RPE_OPTIONS.map((v) => <option key={v === "" ? "blank" : v} value={v === "" ? "" : v}>{v === "" ? "" : v}</option>)}
                        </select>
                        {bulkErrors[`sets.${i}.rpe`] && <p className="text-xs text-error">{bulkErrors[`sets.${i}.rpe`]}</p>}
                      </div>
                      <div>
                        <input type="text" value={row.notes} onChange={(e) => updateBulkRow(i, "notes", e.target.value)} placeholder="Notes" className="input w-full px-1.5 py-0.5 text-sm" disabled={isPending} />
                        {bulkErrors[`sets.${i}.notes`] && <p className="text-xs text-error">{bulkErrors[`sets.${i}.notes`]}</p>}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
              {bulkErrors._ && <p className="text-xs text-error">{bulkErrors._}</p>}
              <button type="submit" disabled={isPending} className="tap-target rounded bg-primary px-3 py-2 text-sm text-white outline-none hover:bg-primary-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center gap-1.5">
                {isPending ? <><Spinner /><span>Saving…</span></> : `Add ${displayRows.length} Sets`}
              </button>
            </form>

            {lastSet && (
              <form onSubmit={handleRepeatLast} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 border-t border-border pt-3 text-sm">
                <span className="text-muted">Repeat Last Set:</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={repeatCountStr}
                  onChange={(e) => setRepeatCountStr(e.target.value)}
                  placeholder="1–10"
                  className="input w-full sm:w-14 min-h-[44px] sm:min-h-0 py-1 sm:py-0.5 text-sm"
                  disabled={isPending}
                />
                <button type="submit" disabled={isPending} className="tap-target rounded bg-primary px-3 py-2 text-sm text-white outline-none hover:bg-primary-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center gap-1.5">
                  {isPending ? <><Spinner /><span>Saving…</span></> : <>+ Add {repeatCountStr === "" ? "?" : Math.max(1, Math.min(10, parseInt(repeatCountStr, 10) || 1))} sets like last</>}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
