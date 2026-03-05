"use client";

import { useState, useTransition } from "react";
import type { Set } from "@prisma/client";
import { deleteSet, updateSet } from "@/app/actions/sets";
import { formatWeight, toDisplay } from "@/lib/units";

const RPE_OPTIONS: (number | "")[] = [
  "",
  ...Array.from({ length: 19 }, (_, i) => 1 + i * 0.5),
];

export function SetRow({ set }: { set: Set }) {
  const [editing, setEditing] = useState(false);
  const [weightLb, setWeightLb] = useState(String(toDisplay(set.weightKg, "weight")));
  const [reps, setReps] = useState(String(set.reps));
  const [rpe, setRpe] = useState<number | "">(set.rpe ?? "");
  const [notes, setNotes] = useState(set.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setErrors({});
    const formData = new FormData();
    formData.set("weightLb", weightLb.trim());
    formData.set("reps", reps.trim());
    formData.set("rpe", rpe === "" ? "" : String(rpe));
    formData.set("notes", notes.trim());
    startTransition(async () => {
      const result = await updateSet(set.id, formData);
      if (result.ok) {
        setEditing(false);
        return;
      }
      setErrors(result.errors);
    });
  }

  function handleCancel() {
    setWeightLb(String(toDisplay(set.weightKg, "weight")));
    setReps(String(set.reps));
    setRpe(set.rpe ?? "");
    setNotes(set.notes ?? "");
    setEditing(false);
    setErrors({});
  }

  const hasDetails = set.rpe != null || (set.notes != null && set.notes !== "");

  return (
    <li className="flex flex-wrap items-center justify-between gap-1 text-sm">
      <div className="min-w-0 flex-1">
        {!editing && (
          <>
            <span>
              {formatWeight(set.weightKg)} × {set.reps} reps
            </span>
            {hasDetails && (
          <span className="ml-2 text-muted">
            {set.rpe != null && `RPE ${set.rpe}`}
            {set.rpe != null && set.notes?.trim() && " · "}
            {set.notes?.trim() && `“${set.notes}”`}
          </span>
            )}
          </>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2 w-full mt-1 sm:mt-0 sm:flex-row sm:flex-wrap sm:items-center sm:w-auto">
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <label htmlFor={`set-weight-${set.id}`} className="sr-only">Weight (lb)</label>
              <input
                id={`set-weight-${set.id}`}
                type="number"
                step="0.1"
                min={0}
                value={weightLb}
                onChange={(e) => setWeightLb(e.target.value)}
                placeholder="lb"
                className="input w-16 min-h-[44px] sm:min-h-0 px-1.5 py-0.5 text-sm"
                disabled={isPending}
              />
              {errors.weightLb && <span className="text-xs text-error block">{errors.weightLb}</span>}
            </div>
            <div>
              <label htmlFor={`set-reps-${set.id}`} className="sr-only">Reps</label>
              <input
                id={`set-reps-${set.id}`}
                type="number"
                min={0}
                step={1}
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="reps"
                className="input w-14 min-h-[44px] sm:min-h-0 px-1.5 py-0.5 text-sm"
                disabled={isPending}
              />
              {errors.reps && <span className="text-xs text-error block">{errors.reps}</span>}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor={`set-rpe-num-${set.id}`} className="sr-only sm:hidden">RPE</label>
              <input
                id={`set-rpe-num-${set.id}`}
                type="number"
                min={1}
                max={10}
                step={0.5}
                value={rpe === "" ? "" : rpe}
                onChange={(e) => {
                  const v = e.target.value;
                  setRpe(v === "" ? "" : Number(v));
                }}
                placeholder="RPE"
                className="input w-14 min-h-[44px] sm:min-h-0 px-1.5 py-0.5 text-sm sm:hidden"
                disabled={isPending}
                aria-label="RPE"
              />
              <label htmlFor={`set-rpe-${set.id}`} className="sr-only hidden sm:inline">RPE</label>
              <select
                id={`set-rpe-${set.id}`}
                value={rpe === "" ? "" : rpe}
                onChange={(e) => setRpe(e.target.value === "" ? "" : Number(e.target.value))}
                className="input w-14 px-1.5 py-0.5 text-sm hidden sm:block min-h-[44px] md:min-h-0"
                disabled={isPending}
              >
                {RPE_OPTIONS.map((v) => (
                  <option key={v === "" ? "blank" : v} value={v === "" ? "" : v}>
                    {v === "" ? "RPE" : v}
                  </option>
                ))}
              </select>
              {errors.rpe && <span className="text-xs text-error block">{errors.rpe}</span>}
            </div>
            <div className="min-w-[80px] max-w-[140px] flex-1 sm:flex-initial">
              <label htmlFor={`set-notes-${set.id}`} className="sr-only">Notes</label>
              <input
                id={`set-notes-${set.id}`}
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes"
                className="input w-full min-h-[44px] sm:min-h-0 px-1.5 py-0.5 text-sm"
                disabled={isPending}
              />
              {errors.notes && <span className="text-xs text-error block">{errors.notes}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="tap-target rounded bg-primary px-3 py-1.5 text-sm text-white outline-none hover:bg-primary-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
            >
              {isPending ? "…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="btn-secondary text-sm tap-target"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="tap-target text-primary hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded disabled:opacity-50 text-sm py-2"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => startTransition(() => deleteSet(set.id))}
            disabled={isPending}
            className="tap-target text-error hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded disabled:opacity-50 text-sm py-2"
          >
            {isPending ? "…" : "Remove"}
          </button>
        </div>
      )}
    </li>
  );
}
