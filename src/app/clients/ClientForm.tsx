"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientActionResult } from "@/app/actions/clients";
import { useToast } from "@/components/ui/toast/use-toast";
import { heightCmToInches, weightKgToLb } from "@/lib/units";

type ClientData = { name: string; age: number; heightCm: number; bodyWeightKg: number };
type Action = (formData: FormData) => Promise<ClientActionResult>;

type Props = {
  action: Action;
  initial?: ClientData;
  clientId?: string;
  successRedirect?: string;
};

const ERROR_FIELD_ORDER: (keyof Record<string, string>)[] = ["name", "age", "heightIn", "bodyWeightLb"];
const FIRST_INPUT_ID_BY_ERROR_KEY: Record<string, string> = {
  name: "name",
  age: "age",
  heightIn: "heightFeet",
  bodyWeightLb: "bodyWeightLb",
};

function heightCmToFeetAndInches(cm: number): { feet: number; inches: number } {
  const totalIn = heightCmToInches(cm);
  const feet = Math.floor(totalIn / 12);
  const inches = Math.round((totalIn % 12) * 10) / 10;
  return { feet, inches };
}

function scrollToFirstError(errors: Record<string, string>) {
  const firstKey = ERROR_FIELD_ORDER.find((k) => errors[k]);
  if (!firstKey) return;
  const id = FIRST_INPUT_ID_BY_ERROR_KEY[firstKey];
  const el = id ? document.getElementById(id) : null;
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    (el as HTMLInputElement).focus?.();
  }
}

export function ClientForm({ action, initial, clientId, successRedirect }: Props) {
  const router = useRouter();
  const { addToast } = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const defaultHeight = initial != null ? heightCmToFeetAndInches(initial.heightCm) : null;

  function clearError(field: string) {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setErrors({});
    const result = await action(formData);
    if (result.ok) {
      addToast("success", clientId ? "Profile updated." : "Client created.");
      if (result.id) router.push(`/clients/${result.id}`);
      else if (successRedirect) router.push(successRedirect);
      else router.refresh();
      return;
    }
    const firstError = result.errors && Object.values(result.errors)[0];
    addToast("error", firstError ?? "Something went wrong.");
    setErrors(result.errors);
    setSubmitting(false);
    setTimeout(() => scrollToFirstError(result.errors), 0);
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
          onChange={() => clearError("name")}
          onBlur={() => clearError("name")}
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
          onChange={() => clearError("age")}
          onBlur={() => clearError("age")}
        />
        {errors.age && <p className="mt-1 text-sm text-error">{errors.age}</p>}
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:gap-3">
        <div className="flex-1 min-w-0">
          <label htmlFor="heightFeet" className="block text-sm font-medium text-[var(--text)]">
            Height
          </label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <input
              id="heightFeet"
              name="heightFeet"
              type="number"
              min={0}
              max={10}
              placeholder="ft"
              defaultValue={defaultHeight?.feet}
              className="input w-full sm:w-20 min-h-[44px] sm:min-h-0"
              onChange={() => clearError("heightIn")}
              onBlur={() => clearError("heightIn")}
            />
            <span className="text-muted hidden sm:inline">ft</span>
            <input
              id="heightInInches"
              name="heightInInches"
              type="number"
              min={0}
              max={11.9}
              step="0.1"
              placeholder="in"
              defaultValue={defaultHeight?.inches}
              className="input w-full sm:w-20 min-h-[44px] sm:min-h-0"
              onChange={() => clearError("heightIn")}
              onBlur={() => clearError("heightIn")}
            />
            <span className="text-muted">in</span>
          </div>
        </div>
      </div>
      {errors.heightIn && <p className="mt-1 text-sm text-error">{errors.heightIn}</p>}
      <div>
        <label htmlFor="bodyWeightLb" className="block text-sm font-medium text-[var(--text)]">
          Body Weight (lb)
        </label>
        <input
          id="bodyWeightLb"
          name="bodyWeightLb"
          type="number"
          step="0.1"
          min={0}
          max={2000}
          defaultValue={initial != null ? weightKgToLb(initial.bodyWeightKg) : undefined}
          className="input mt-1"
          onChange={() => clearError("bodyWeightLb")}
          onBlur={() => clearError("bodyWeightLb")}
        />
        {errors.bodyWeightLb && <p className="mt-1 text-sm text-error">{errors.bodyWeightLb}</p>}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
        <button type="submit" disabled={submitting} className="btn-primary inline-flex items-center justify-center gap-2">
          {submitting && (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
          )}
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

/*
 * Manual QA checklist (Add Client / Edit Client form):
 * [ ] Submit with empty name → name error shows; type in name → error clears immediately
 * [ ] Submit with age < 0 or > 120 → age error; fix value → error clears on change/blur
 * [ ] Submit with invalid height (e.g. 20 ft) → heightIn error; fix feet/in → error clears
 * [ ] Submit with body weight < 0 or > 2000 → bodyWeightLb error; fix → error clears
 * [ ] Submit with multiple errors → page scrolls to first invalid field (name → age → height → weight)
 * [ ] First invalid input receives focus after scroll
 * [ ] Numeric inputs enforce min/max in UI (age 0–120, height ft 0–10 in 0–11.9, weight 0–2000)
 */
