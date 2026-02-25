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

export function ClientForm({ action, initial, clientId, successRedirect }: Props) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

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
          Age
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
      <div>
        <label htmlFor="heightIn" className="block text-sm font-medium text-[var(--text)]">
          Height (in)
        </label>
        <input
          id="heightIn"
          name="heightIn"
          type="number"
          step="0.1"
          min="1"
          max="120"
          defaultValue={initial != null ? heightCmToInches(initial.heightCm) : undefined}
          className="input mt-1"
        />
        {errors.heightIn && <p className="mt-1 text-sm text-error">{errors.heightIn}</p>}
      </div>
      <div>
        <label htmlFor="bodyWeightLb" className="block text-sm font-medium text-[var(--text)]">
          Body weight (lb)
        </label>
        <input
          id="bodyWeightLb"
          name="bodyWeightLb"
          type="number"
          step="0.1"
          min="0.1"
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
