"use client";

import { useTransition, useState } from "react";
import { createSet } from "@/app/actions/sets";

export function AddSetForm({ exerciseId }: { exerciseId: string }) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const formData = new FormData();
    formData.set("weightLb", weight);
    formData.set("reps", reps);
    startTransition(async () => {
      const result = await createSet(exerciseId, formData);
      if (result.ok) {
        setWeight("");
        setReps("");
        return;
      }
      setErrors(result.errors);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex items-end gap-2 text-sm">
      <div>
        <label htmlFor={`weight-${exerciseId}`} className="sr-only">
          Weight (lb)
        </label>
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
        {errors.weightLb && (
          <p className="text-xs text-error">{errors.weightLb}</p>
        )}
      </div>
      <div>
        <label htmlFor={`reps-${exerciseId}`} className="sr-only">
          Reps
        </label>
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
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-secondary px-2 py-1 text-white outline-none hover:bg-secondary-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
      >
        {isPending ? "…" : "Add set"}
      </button>
    </form>
  );
}
