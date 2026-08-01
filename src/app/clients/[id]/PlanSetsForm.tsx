"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPlannedSets } from "@/app/actions/sets";

/**
 * Prescribe N identical sets at a target weight × reps. The client checks them
 * off during the workout; anything they don't reach stays visible as skipped.
 */
export function PlanSetsForm({ exerciseId }: { exerciseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("3");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const n = parseInt(count, 10);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      setError("Plan between 1 and 10 sets.");
      return;
    }
    const rows = Array.from({ length: n }, () => ({ weight: weight.trim(), reps: reps.trim() }));
    const formData = new FormData();
    formData.set("exerciseId", exerciseId);
    formData.set("setsJson", JSON.stringify(rows));

    startTransition(async () => {
      const result = await createPlannedSets(formData);
      if (!result.ok) {
        setError(Object.values(result.errors)[0] ?? "Could not plan those sets.");
        return;
      }
      setWeight("");
      setReps("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary text-xs py-1 px-2 gap-1.5"
      >
        <span aria-hidden="true">📋</span> Plan Sets
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded border border-dashed border-muted/50 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`plan-count-${exerciseId}`} className="block text-xs text-muted">Sets</label>
          <input
            id={`plan-count-${exerciseId}`}
            type="number" min={1} max={10} step={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="input w-14 px-1.5 py-0.5 text-sm min-h-[44px] sm:min-h-0"
            disabled={isPending}
          />
        </div>
        <span className="pb-2 text-muted">×</span>
        <div>
          <label htmlFor={`plan-reps-${exerciseId}`} className="block text-xs text-muted">Reps</label>
          <input
            id={`plan-reps-${exerciseId}`}
            type="number" min={0} step={1}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            placeholder="reps"
            className="input w-16 px-1.5 py-0.5 text-sm min-h-[44px] sm:min-h-0"
            disabled={isPending}
            required
          />
        </div>
        <span className="pb-2 text-muted">@</span>
        <div>
          <label htmlFor={`plan-weight-${exerciseId}`} className="block text-xs text-muted">Weight (lb)</label>
          <input
            id={`plan-weight-${exerciseId}`}
            type="number" min={0} step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="lb"
            className="input w-20 px-1.5 py-0.5 text-sm min-h-[44px] sm:min-h-0"
            disabled={isPending}
            required
          />
        </div>
        <button type="submit" disabled={isPending} className="btn-primary text-xs py-1 px-2">
          {isPending ? "…" : "Add Plan"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          disabled={isPending}
          className="btn-secondary text-xs py-1 px-2"
        >
          Cancel
        </button>
      </div>
      {error && <span className="text-xs text-error">{error}</span>}
    </form>
  );
}
