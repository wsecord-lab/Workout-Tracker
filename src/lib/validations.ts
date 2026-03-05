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
  rpe?: string;
  notes?: string;
};

/** RPE: allow null/blank or values 1–10 in 0.5 steps (Number.isInteger(rpe*2)). Returns null for blank, number when valid, undefined when invalid. */
export function parseRpe(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const s = typeof value === "string" ? value.trim() : String(value).trim();
  if (s === "") return null;
  const n = typeof value === "number" ? value : parseFloat(s);
  if (Number.isNaN(n) || !Number.isInteger(n * 2) || n < 1 || n > 10) return undefined;
  return n;
}

/** Notes: optional string, trim, empty -> null. */
export function parseNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = typeof value === "string" ? value.trim() : String(value).trim();
  return s === "" ? null : s;
}

export type SetDetailsFormErrors = { rpe?: string; notes?: string };

/** Validate only RPE and notes (for set-details updates). */
export function validateSetDetails(data: {
  rpe?: unknown;
  notes?: unknown;
}): { ok: true; data: { rpe: number | null; notes: string | null } } | { ok: false; errors: SetDetailsFormErrors } {
  const errors: SetDetailsFormErrors = {};
  const rpeResult = parseRpe(data.rpe);
  if (rpeResult === undefined) errors.rpe = "RPE must be 1–10 in 0.5 steps or empty";
  const notes = parseNotes(data.notes);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { rpe: rpeResult ?? null, notes } };
}

const DEFAULT_AGE = 18;
const DEFAULT_HEIGHT_IN = 66; // 5 ft 6 in
const DEFAULT_BODY_WEIGHT_LB = 150;

function parseNum(value: unknown): number {
  if (value === undefined || value === null) return NaN;
  if (typeof value === "number") return value;
  const s = typeof value === "string" ? value.trim() : String(value).trim();
  return s === "" ? NaN : parseFloat(s);
}

export function validateClient(
  data: {
    name: unknown;
    age?: unknown;
    heightIn?: unknown;
    heightFeet?: unknown;
    heightInInches?: unknown;
    bodyWeightLb?: unknown;
  },
  options?: { optionalFields?: boolean }
): { ok: true; data: { name: string; age: number; heightCm: number; bodyWeightKg: number } } | { ok: false; errors: ClientFormErrors } {
  const errors: ClientFormErrors = {};
  const optional = options?.optionalFields === true;

  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name) errors.name = "Name is required";

  const ageInput = typeof data.age === "string" ? (data.age.trim() === "" ? NaN : parseInt(data.age, 10)) : typeof data.age === "number" ? data.age : NaN;
  const age = optional && Number.isNaN(ageInput) ? DEFAULT_AGE : ageInput;
  if (!optional && Number.isNaN(age)) errors.age = "Age is required";
  else if (!Number.isNaN(age) && (age < 0 || age > 120)) errors.age = "Age must be 0–120";

  const feet = parseNum(data.heightFeet);
  const inchPart = parseNum(data.heightInInches);
  const totalInFromFtIn = !Number.isNaN(feet) && !Number.isNaN(inchPart) ? feet * 12 + inchPart : NaN;
  const heightInInput = !Number.isNaN(totalInFromFtIn) ? totalInFromFtIn : (typeof data.heightIn === "string" ? (data.heightIn.trim() === "" ? NaN : parseFloat(data.heightIn)) : typeof data.heightIn === "number" ? data.heightIn : NaN);
  const heightIn = optional && Number.isNaN(heightInInput) ? DEFAULT_HEIGHT_IN : heightInInput;
  if (!optional && Number.isNaN(heightIn)) errors.heightIn = "Height is required";
  else if (!Number.isNaN(heightIn) && (heightIn <= 0 || heightIn > 120)) errors.heightIn = "Height must be 1–120 in";

  const bodyWeightLbInput = typeof data.bodyWeightLb === "string" ? (data.bodyWeightLb.trim() === "" ? NaN : parseFloat(data.bodyWeightLb)) : typeof data.bodyWeightLb === "number" ? data.bodyWeightLb : NaN;
  const bodyWeightLb = optional && Number.isNaN(bodyWeightLbInput) ? DEFAULT_BODY_WEIGHT_LB : bodyWeightLbInput;
  if (!optional && Number.isNaN(bodyWeightLb)) errors.bodyWeightLb = "Body weight is required";
  else if (!Number.isNaN(bodyWeightLb) && (bodyWeightLb <= 0 || bodyWeightLb > 2000)) errors.bodyWeightLb = "Body weight must be 1–2000 lb";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const heightCm = Math.round(toStorage(heightIn, "height") * 100) / 100;
  const bodyWeightKg = Math.round(toStorage(bodyWeightLb, "weight") * 1e6) / 1e6;
  return { ok: true, data: { name, age, heightCm, bodyWeightKg } };
}

export function validateSet(data: {
  weightLb: unknown;
  reps: unknown;
  rpe?: unknown;
  notes?: unknown;
}): { ok: true; data: { weightKg: number; reps: number; rpe: number | null; notes: string | null } } | { ok: false; errors: SetFormErrors } {
  const errors: SetFormErrors = {};
  const weightLb = typeof data.weightLb === "string" ? parseFloat(data.weightLb) : typeof data.weightLb === "number" ? data.weightLb : NaN;
  if (Number.isNaN(weightLb) || weightLb < 0) errors.weightLb = "Weight must be ≥ 0 lb";

  const reps = typeof data.reps === "string" ? parseInt(data.reps, 10) : typeof data.reps === "number" ? data.reps : NaN;
  if (Number.isNaN(reps) || reps < 0) errors.reps = "Reps must be ≥ 0";

  const rpeResult = parseRpe(data.rpe);
  if (rpeResult === undefined) errors.rpe = "RPE must be 1–10 in 0.5 steps or empty";
  const notes = parseNotes(data.notes);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const weightKg = Math.round(toStorage(weightLb, "weight") * 1e6) / 1e6;
  return { ok: true, data: { weightKg, reps, rpe: rpeResult ?? null, notes } };
}
