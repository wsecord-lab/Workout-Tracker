import { toStorage } from "@/lib/units";

export type ClientFormErrors = {
  name?: string;
  age?: string;
  heightIn?: string;
  bodyWeightLb?: string;
};

export type SetFormErrors = {
  weightLb?: string;
  reps?: string;
};

export function validateClient(data: {
  name: unknown;
  age: unknown;
  heightIn: unknown;
  bodyWeightLb: unknown;
}): { ok: true; data: { name: string; age: number; heightCm: number; bodyWeightKg: number } } | { ok: false; errors: ClientFormErrors } {
  const errors: ClientFormErrors = {};
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) errors.name = "Name is required";

  const age = typeof data.age === "string" ? parseInt(data.age, 10) : typeof data.age === "number" ? data.age : NaN;
  if (Number.isNaN(age) || age < 0 || age > 120) errors.age = "Age must be 0–120";

  const heightIn = typeof data.heightIn === "string" ? parseFloat(data.heightIn) : typeof data.heightIn === "number" ? data.heightIn : NaN;
  if (Number.isNaN(heightIn) || heightIn <= 0 || heightIn > 120) errors.heightIn = "Height must be 1–120 in";

  const bodyWeightLb = typeof data.bodyWeightLb === "string" ? parseFloat(data.bodyWeightLb) : typeof data.bodyWeightLb === "number" ? data.bodyWeightLb : NaN;
  if (Number.isNaN(bodyWeightLb) || bodyWeightLb <= 0 || bodyWeightLb > 2000) errors.bodyWeightLb = "Body weight must be 1–2000 lb";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const heightCm = Math.round(toStorage(heightIn, "height") * 100) / 100;
  const bodyWeightKg = Math.round(toStorage(bodyWeightLb, "weight") * 1000) / 1000;
  return { ok: true, data: { name, age, heightCm, bodyWeightKg } };
}

export function validateSet(data: { weightLb: unknown; reps: unknown }): { ok: true; data: { weightKg: number; reps: number } } | { ok: false; errors: SetFormErrors } {
  const errors: SetFormErrors = {};
  const weightLb = typeof data.weightLb === "string" ? parseFloat(data.weightLb) : typeof data.weightLb === "number" ? data.weightLb : NaN;
  if (Number.isNaN(weightLb) || weightLb < 0) errors.weightLb = "Weight must be ≥ 0 lb";

  const reps = typeof data.reps === "string" ? parseInt(data.reps, 10) : typeof data.reps === "number" ? data.reps : NaN;
  if (Number.isNaN(reps) || reps < 0) errors.reps = "Reps must be ≥ 0";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const weightKg = Math.round(toStorage(weightLb, "weight") * 1000) / 1000;
  return { ok: true, data: { weightKg, reps } };
}
