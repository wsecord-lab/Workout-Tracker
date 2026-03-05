"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientActionResult } from "@/app/actions/clients";
import { heightCmToInches, weightKgToLb } from "@/lib/units";

type ClientData = { name: string; age: number; heightCm: number; bodyWeightKg: number };
type Action = (formData: FormData) => Promise<ClientActionResult>;

type Props = {
  action: Action;
  initial?: ClientData;
  clientId?: string;
  successRedirect?: string;
};

function heightCmToFeetAndInches(cm: number): { feet: number; inches: number } {
  const totalIn = heightCmToInches(cm);
  const feet = Math.floor(totalIn / 12);
  const inches = Math.round((totalIn % 12) * 10) / 10;
  return { feet, inches };
}

export function ClientForm({ action, initial, clientId, successRedirect }: Props) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const defaultHeight = initial != null ? heightCmToFeetAndInches(initial.heightCm) : null;

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setErrors({});
    const result = await action(formData);
    if (result.ok) {
      if (result.id) router.push(`/clients/${result.id}`);
      else if (successRedirect) router.push(successRedirect);
      else router.refresh();
      return;
    }
    setErrors(result.errors);
    setSubmitting(false);
  }

  return (
    <form action={handleSubmit} className="card max-w-md space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-[var(--text)]">
          Name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={initial?.name}
          className="input mt-1"
          required
        />
        {errors.name && <p className="mt-1 text-sm text-error">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor="age" className="block text-sm font-medium text-[var(--text)]">
          Age <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="age"
          name="age"
          type="number"
          min={0}
          max={120}
          defaultValue={initial?.age}
          className="input mt-1"
        />
        {errors.age && <p className="mt-1 text-sm text-error">{errors.age}</p>}
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="heightFeet" className="block text-sm font-medium text-[var(--text)]">
            Height <span className="text-muted font-normal">(optional)</span>
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="heightFeet"
              name="heightFeet"
              type="number"
              min={0}
              max={10}
              placeholder="ft"
              defaultValue={defaultHeight?.feet}
              className="input w-20"
            />
            <span className="text-muted">ft</span>
            <input
              id="heightInInches"
              name="heightInInches"
              type="number"
              min={0}
              max={11.9}
              step="0.1"
              placeholder="in"
              defaultValue={defaultHeight?.inches}
              className="input w-20"
            />
            <span className="text-muted">in</span>
          </div>
        </div>
      </div>
      {errors.heightIn && <p className="mt-1 text-sm text-error">{errors.heightIn}</p>}
      <div>
        <label htmlFor="bodyWeightLb" className="block text-sm font-medium text-[var(--text)]">
          Body weight (lb) <span className="text-muted font-normal">(optional)</span>
        </label>
        <input
          id="bodyWeightLb"
          name="bodyWeightLb"
          type="number"
          step="0.1"
          min={0}
          defaultValue={initial != null ? weightKgToLb(initial.bodyWeightKg) : undefined}
          className="input mt-1"
        />
        {errors.bodyWeightLb && <p className="mt-1 text-sm text-error">{errors.bodyWeightLb}</p>}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Saving…" : clientId ? "Update" : "Create"}
        </button>
        {clientId && (
          <a href={`/clients/${clientId}`} className="btn-secondary">
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
