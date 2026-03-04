"use client";

import { useState, useTransition } from "react";
import type { Set } from "@prisma/client";
import { deleteSet, updateSetDetails } from "@/app/actions/sets";
import { formatWeight } from "@/lib/units";

const RPE_OPTIONS: (number | "")[] = [
  "",
  ...Array.from({ length: 19 }, (_, i) => 1 + i * 0.5),
];

export function SetRow({ set }: { set: Set }) {
  const [editing, setEditing] = useState(false);
  const [rpe, setRpe] = useState<number | "">(set.rpe ?? "");
  const [notes, setNotes] = useState(set.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function handleSaveDetails() {
    setErrors({});
    const formData = new FormData();
    formData.set("rpe", rpe === "" ? "" : String(rpe));
    formData.set("notes", notes.trim());
    startTransition(async () => {
      const result = await updateSetDetails(set.id, formData);
      if (result.ok) {
        setEditing(false);
        return;
      }
      setErrors(result.errors);
    });
  }

  const hasDetails = set.rpe != null || (set.notes != null && set.notes !== "");

  return (
    <li className="flex flex-wrap items-center justify-between gap-1 text-sm">
      <div className="min-w-0 flex-1">
        <span>
          {formatWeight(set.weightKg)} × {set.reps} reps
        </span>
        {!editing && hasDetails && (
          <span className="ml-2 text-muted">
            {set.rpe != null && `RPE ${set.rpe}`}
            {set.rpe != null && set.notes?.trim() && " · "}
            {set.notes?.trim() && `“${set.notes}”`}
          </span>
        )}
      </div>
      {editing ? (
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={rpe === "" ? "" : rpe}
            onChange={(e) => setRpe(e.target.value === "" ? "" : Number(e.target.value))}
            className="input w-14 px-1.5 py-0.5 text-sm"
            disabled={isPending}
          >
            {RPE_OPTIONS.map((v) => (
              <option key={v === "" ? "blank" : v} value={v === "" ? "" : v}>
                {v === "" ? "RPE" : v}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            className="input min-w-[80px] max-w-[160px] px-1.5 py-0.5 text-sm"
            disabled={isPending}
          />
          {(errors.rpe || errors.notes) && (
            <span className="text-xs text-error">{errors.rpe || errors.notes}</span>
          )}
          <button
            type="button"
            onClick={handleSaveDetails}
            disabled={isPending}
            className="rounded bg-primary px-2 py-0.5 text-sm text-white outline-none hover:bg-primary-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
          >
            {isPending ? "…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setRpe(set.rpe ?? "");
              setNotes(set.notes ?? "");
              setEditing(false);
              setErrors({});
            }}
            disabled={isPending}
            className="btn-secondary text-sm py-0.5 px-2"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-primary hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded disabled:opacity-50 text-xs"
          >
            Edit RPE/Notes
          </button>
          <button
            type="button"
            onClick={() => startTransition(() => deleteSet(set.id))}
            disabled={isPending}
            className="text-error hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded disabled:opacity-50"
          >
            {isPending ? "…" : "Remove"}
          </button>
        </div>
      )}
    </li>
  );
}
