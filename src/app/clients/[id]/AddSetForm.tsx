"use client";

import React, { useTransition, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSet, createSetsBulk } from "@/app/actions/sets";
import { toDisplay } from "@/lib/units";
import type { Set } from "@prisma/client";

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
}: {
  exerciseId: string;
  lastSet?: Set | null;
}) {
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [rpe, setRpe] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

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
        setWeight("");
        setReps("");
        setRpe("");
        setNotes("");
        router.refresh();
        return;
      }
      setErrors(result.errors);
    });
  }

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

  const displayRows = bulkRows.slice(0, Math.max(1, Math.min(10, numBulkSets)));

  return (
    <div className="mt-2 space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 text-sm">
        <div>
          <label htmlFor={`weight-${exerciseId}`} className="sr-only">Weight (lb)</label>
          <input
            id={`weight-${exerciseId}`}
            type="number"
            step="0.1"
            min="0"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="lb"
            className="input w-20 px-2 py-1 text-sm"
            disabled={isPending}
          />
          {errors.weightLb && <p className="text-xs text-error">{errors.weightLb}</p>}
        </div>
        <div>
          <label htmlFor={`reps-${exerciseId}`} className="sr-only">Reps</label>
          <input
            id={`reps-${exerciseId}`}
            type="number"
            min="0"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            placeholder="reps"
            className="input w-16 px-2 py-1 text-sm"
            disabled={isPending}
          />
          {errors.reps && <p className="text-xs text-error">{errors.reps}</p>}
        </div>
        <div>
          <label htmlFor={`rpe-${exerciseId}`} className="sr-only">RPE (optional)</label>
          <select
            id={`rpe-${exerciseId}`}
            value={rpe === "" ? "" : rpe}
            onChange={(e) => setRpe(e.target.value === "" ? "" : Number(e.target.value))}
            className="input w-16 px-2 py-1 text-sm"
            disabled={isPending}
          >
            {RPE_OPTIONS.map((v) => (
              <option key={v === "" ? "blank" : v} value={v === "" ? "" : v}>
                {v === "" ? "RPE" : v}
              </option>
            ))}
          </select>
          {errors.rpe && <p className="text-xs text-error">{errors.rpe}</p>}
        </div>
        <div className="min-w-[120px] flex-1">
          <label htmlFor={`notes-${exerciseId}`} className="sr-only">Notes (optional)</label>
          <input
            id={`notes-${exerciseId}`}
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            className="input w-full px-2 py-1 text-sm"
            disabled={isPending}
          />
          {errors.notes && <p className="text-xs text-error">{errors.notes}</p>}
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-secondary px-2 py-1 text-white outline-none hover:bg-secondary-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
        >
          {isPending ? "…" : "Add set"}
        </button>
      </form>

      <section className="rounded border border-border bg-background/50 p-3">
        <h4 className="mb-2 text-sm font-medium text-[var(--text)]">Add Sets</h4>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-muted">Number of sets</span>
            <select
              value={numBulkSets}
              onChange={(e) => setNumBulkSets(Number(e.target.value))}
              className="input w-16 py-1 text-sm"
              disabled={isPending}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {lastSet && (
            <label className="flex items-center gap-2 text-muted">
              <input
                type="checkbox"
                checked={copyFromPrevious}
                onChange={(e) => setCopyFromPrevious(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                disabled={isPending}
              />
              Copy values from previous set
            </label>
          )}
        </div>
        <form onSubmit={handleBulkSubmit} className="space-y-2">
          <div className="overflow-x-auto">
            <div className="grid min-w-[400px] grid-cols-[auto_1fr_1fr_1fr_2fr] gap-2 text-sm md:grid-cols-[auto_80px_70px_70px_1fr]">
              <div className="font-medium text-muted">Set #</div>
              <div className="font-medium text-muted">Weight</div>
              <div className="font-medium text-muted">Reps</div>
              <div className="font-medium text-muted">RPE</div>
              <div className="font-medium text-muted">Notes</div>
              {displayRows.map((row, i) => (
                <React.Fragment key={i}>
                  <div className="flex items-center text-muted">
                    {i + 1}
                  </div>
                  <div>
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      value={row.weightLb}
                      onChange={(e) => updateBulkRow(i, "weightLb", e.target.value)}
                      placeholder="lb"
                      className="input w-full px-1.5 py-0.5 text-sm"
                      disabled={isPending}
                    />
                    {bulkErrors[`sets.${i}.weight`] && (
                      <p className="text-xs text-error">{bulkErrors[`sets.${i}.weight`]}</p>
                    )}
                  </div>
                  <div>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={row.reps}
                      onChange={(e) => updateBulkRow(i, "reps", e.target.value)}
                      placeholder="reps"
                      className="input w-full px-1.5 py-0.5 text-sm"
                      disabled={isPending}
                    />
                    {bulkErrors[`sets.${i}.reps`] && (
                      <p className="text-xs text-error">{bulkErrors[`sets.${i}.reps`]}</p>
                    )}
                  </div>
                  <div>
                    <select
                      value={row.rpe}
                      onChange={(e) => updateBulkRow(i, "rpe", e.target.value)}
                      className="input w-full px-1.5 py-0.5 text-sm"
                      disabled={isPending}
                    >
                      {RPE_OPTIONS.map((v) => (
                        <option key={v === "" ? "blank" : v} value={v === "" ? "" : v}>
                          {v === "" ? "" : v}
                        </option>
                      ))}
                    </select>
                    {bulkErrors[`sets.${i}.rpe`] && (
                      <p className="text-xs text-error">{bulkErrors[`sets.${i}.rpe`]}</p>
                    )}
                  </div>
                  <div>
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(e) => updateBulkRow(i, "notes", e.target.value)}
                      placeholder="Notes"
                      className="input w-full px-1.5 py-0.5 text-sm"
                      disabled={isPending}
                    />
                    {bulkErrors[`sets.${i}.notes`] && (
                      <p className="text-xs text-error">{bulkErrors[`sets.${i}.notes`]}</p>
                    )}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
          {bulkErrors._ && <p className="text-xs text-error">{bulkErrors._}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-primary px-3 py-1 text-sm text-white outline-none hover:bg-primary-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
          >
            {isPending ? "…" : `Add ${displayRows.length} Sets`}
          </button>
        </form>

        {lastSet && (
          <form onSubmit={handleRepeatLast} className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
            <span className="text-muted">Repeat last set:</span>
            <input
              type="number"
              min={1}
              max={10}
              value={repeatCountStr}
              onChange={(e) => setRepeatCountStr(e.target.value)}
              placeholder="1–10"
              className="input w-14 py-0.5 text-sm"
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-primary px-2 py-0.5 text-sm text-white outline-none hover:bg-primary-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
            >
              + Add {repeatCountStr === "" ? "?" : Math.max(1, Math.min(10, parseInt(repeatCountStr, 10) || 1))} sets like last
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
