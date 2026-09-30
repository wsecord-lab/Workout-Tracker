import { toStorage } from "@/lib/units";
import { sanitizeNotes as sanitizeNotesInput, sanitizeName, NOTES_MAX_LENGTH, CLIENT_NAME_MAX_LENGTH } from "@/lib/sanitize";

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

/** Notes: optional string, trim, strip HTML, enforce max length, empty -> null. Sanitized for XSS-safe storage. */
export function parseNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = typeof value === "string" ? value.trim() : String(value).trim();
  return s === "" ? null : sanitizeNotesInput(s, NOTES_MAX_LENGTH);
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

export type SetUpdateFormErrors = { weightLb?: string; reps?: string; rpe?: string; notes?: string };

/** Validate full set update payload: weight, reps, rpe (optional), notes (optional). Same storage/units as create. */
export function validateSetUpdate(data: {
  weightLb: unknown;
  reps: unknown;
  rpe?: unknown;
  notes?: unknown;
}): { ok: true; data: { weightKg: number; reps: number; rpe: number | null; notes: string | null } } | { ok: false; errors: SetUpdateFormErrors } {
  const errors: SetUpdateFormErrors = {};
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

export type SetBulkEntry = { weight: number | null; reps: number | null; rpe?: number | null; notes?: string | null };

export type SetBulkFormErrors = Record<string, string>;

/** Validate a single bulk set entry; returns errors keyed by e.g. "sets.0.weight", "sets.0.reps". */
function validateSetBulkEntry(
  entry: unknown,
  index: number
): { ok: true; data: { weightKg: number; reps: number; rpe: number | null; notes: string | null } } | { ok: false; errors: SetBulkFormErrors } {
  const prefix = `sets.${index}.`;
  const errors: SetBulkFormErrors = {};
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    errors[`${prefix}_`] = "Invalid set entry";
    return { ok: false, errors };
  }
  const o = entry as Record<string, unknown>;
  const weightInput = o.weight;
  const weightLb =
    weightInput === null || weightInput === undefined || weightInput === ""
      ? 0
      : typeof weightInput === "number"
        ? weightInput
        : typeof weightInput === "string"
          ? parseFloat(weightInput)
          : NaN;
  if (Number.isNaN(weightLb) || weightLb < 0) errors[`${prefix}weight`] = "Weight must be ≥ 0 lb";

  const repsInput = o.reps;
  const reps =
    repsInput === null || repsInput === undefined
      ? NaN
      : typeof repsInput === "number"
        ? repsInput
        : typeof repsInput === "string"
          ? parseInt(String(repsInput), 10)
          : NaN;
  if (Number.isNaN(reps) || reps < 0) errors[`${prefix}reps`] = "Reps must be ≥ 0";

  const rpeResult = parseRpe(o.rpe);
  if (rpeResult === undefined) errors[`${prefix}rpe`] = "RPE must be 1–10 in 0.5 steps or empty";
  const notes = parseNotes(o.notes);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const weightKg = Math.round(toStorage(weightLb, "weight") * 1e6) / 1e6;
  return { ok: true, data: { weightKg, reps, rpe: rpeResult ?? null, notes } };
}

/** Parse and validate bulk sets from JSON string. Reject if any entry invalid. */
export function validateSetsBulk(setsJson: unknown): { ok: true; data: { weightKg: number; reps: number; rpe: number | null; notes: string | null }[] } | { ok: false; errors: SetBulkFormErrors } {
  if (typeof setsJson !== "string" || setsJson.trim() === "") {
    return { ok: false, errors: { sets: "setsJson is required" } };
  }
  let arr: unknown[];
  try {
    const parsed = JSON.parse(setsJson);
    if (!Array.isArray(parsed)) return { ok: false, errors: { sets: "setsJson must be a JSON array" } };
    arr = parsed;
  } catch {
    return { ok: false, errors: { sets: "Invalid JSON" } };
  }
  const data: { weightKg: number; reps: number; rpe: number | null; notes: string | null }[] = [];
  const allErrors: SetBulkFormErrors = {};
  for (let i = 0; i < arr.length; i++) {
    const result = validateSetBulkEntry(arr[i], i);
    if (!result.ok) {
      Object.assign(allErrors, result.errors);
    } else {
      data.push(result.data);
    }
  }
  if (Object.keys(allErrors).length > 0) return { ok: false, errors: allErrors };
  return { ok: true, data };
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

  const nameRaw = typeof data.name === "string" ? data.name : "";
  const name = sanitizeName(nameRaw, CLIENT_NAME_MAX_LENGTH); // XSS: strip HTML, enforce max length before storage
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

// —— Workout templates ———
const TEMPLATE_NAME_MIN = 2;
const TEMPLATE_NAME_MAX = 60;
const TEMPLATE_ITEMS_MIN = 1;
const TEMPLATE_ITEMS_MAX = 50;
const TEMPLATE_PLANNED_SETS_MIN = 1;
const TEMPLATE_PLANNED_SETS_MAX = 10;

/** Normalize exercise name: trim, collapse spaces, lowercase (for storage/comparison). */
export function normalizeExerciseName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Display name: trim, collapse spaces. */
export function templateExerciseDisplayName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  return s;
}

export type TemplateFormErrors = { name?: string; items?: string; _?: string };

export type TemplateItemValidated = {
  exerciseName: string;
  normalizedName: string;
  orderIndex: number;
  plannedSetCount: number | null;
  plannedWeightKg: number | null;
  plannedReps: number | null;
};

export type TemplateItemInput = {
  exerciseName: string;
  orderIndex: number;
  plannedSetCount?: number | null;
  plannedWeightLb?: number | string | null;
  plannedReps?: number | string | null;
};

function parseOptionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "") return null;
    return parseFloat(t);
  }
  return NaN;
}

/** Parse optional PlanSetsForm-style prescription on a template item. */
function parseTemplateItemPlan(
  o: Record<string, unknown>
): { ok: true; plan: Pick<TemplateItemValidated, "plannedSetCount" | "plannedWeightKg" | "plannedReps"> } | { ok: false; error: string } {
  const hasAnyPlanField =
    (o.plannedSetCount !== undefined && o.plannedSetCount !== null && o.plannedSetCount !== "") ||
    (o.plannedWeightLb !== undefined && o.plannedWeightLb !== null && o.plannedWeightLb !== "") ||
    (o.plannedReps !== undefined && o.plannedReps !== null && o.plannedReps !== "");

  if (!hasAnyPlanField) {
    return {
      ok: true,
      plan: { plannedSetCount: null, plannedWeightKg: null, plannedReps: null },
    };
  }

  const countRaw = parseOptionalNumber(o.plannedSetCount);
  const weightLb = parseOptionalNumber(o.plannedWeightLb);
  const repsRaw = parseOptionalNumber(o.plannedReps);

  if (countRaw == null || !Number.isInteger(countRaw) || countRaw < TEMPLATE_PLANNED_SETS_MIN || countRaw > TEMPLATE_PLANNED_SETS_MAX) {
    return { ok: false, error: `Planned sets must be ${TEMPLATE_PLANNED_SETS_MIN}–${TEMPLATE_PLANNED_SETS_MAX}` };
  }
  if (weightLb == null || Number.isNaN(weightLb) || weightLb < 0) {
    return { ok: false, error: "Planned weight must be ≥ 0 lb" };
  }
  if (repsRaw == null || Number.isNaN(repsRaw) || !Number.isInteger(repsRaw) || repsRaw < 0) {
    return { ok: false, error: "Planned reps must be ≥ 0" };
  }

  const plannedWeightKg = Math.round(toStorage(weightLb, "weight") * 1e6) / 1e6;
  return {
    ok: true,
    plan: {
      plannedSetCount: countRaw,
      plannedWeightKg,
      plannedReps: repsRaw,
    },
  };
}

function parseTemplateItemsFromNames(rawNames: unknown): TemplateItemValidated[] | null {
  if (!Array.isArray(rawNames)) return null;
  const names = rawNames
    .filter((n): n is string => typeof n === "string")
    .map((n) => templateExerciseDisplayName(n))
    .filter((n) => n.length > 0);
  if (names.length < TEMPLATE_ITEMS_MIN || names.length > TEMPLATE_ITEMS_MAX) return null;
  return names.map((displayName, i) => ({
    exerciseName: displayName,
    normalizedName: normalizeExerciseName(displayName),
    orderIndex: i,
    plannedSetCount: null,
    plannedWeightKg: null,
    plannedReps: null,
  }));
}

function parseTemplateItemsFromObjects(
  rawItems: unknown
): { ok: true; items: TemplateItemValidated[] } | { ok: false; error: string } {
  if (!Array.isArray(rawItems) || rawItems.length < TEMPLATE_ITEMS_MIN || rawItems.length > TEMPLATE_ITEMS_MAX) {
    return {
      ok: false,
      error: `Template must have ${TEMPLATE_ITEMS_MIN}–${TEMPLATE_ITEMS_MAX} exercises`,
    };
  }
  const parsed: TemplateItemValidated[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const entry = rawItems[i];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, error: "Each template item must be an object" };
    }
    const o = entry as Record<string, unknown>;
    const exName =
      typeof o.exerciseName === "string" ? templateExerciseDisplayName(o.exerciseName) : "";
    if (!exName) {
      return { ok: false, error: `Template must have at least ${TEMPLATE_ITEMS_MIN} exercises (no empty names)` };
    }
    const orderIndex = typeof o.orderIndex === "number" ? o.orderIndex : i;
    const planResult = parseTemplateItemPlan(o);
    if (!planResult.ok) return { ok: false, error: planResult.error };
    parsed.push({
      exerciseName: exName,
      normalizedName: normalizeExerciseName(exName),
      orderIndex,
      ...planResult.plan,
    });
  }
  const items = parsed
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((item, i) => ({ ...item, orderIndex: i }));
  return { ok: true, items };
}

export function validateTemplateCreate(data: {
  name: unknown;
  exerciseNames?: unknown;
  items?: unknown;
}): { ok: true; data: { name: string; items: TemplateItemValidated[] } } | { ok: false; errors: TemplateFormErrors } {
  const errors: TemplateFormErrors = {};
  const nameRaw = typeof data.name === "string" ? data.name : "";
  const name = nameRaw.trim();
  if (name.length < TEMPLATE_NAME_MIN || name.length > TEMPLATE_NAME_MAX) {
    errors.name = `Name must be ${TEMPLATE_NAME_MIN}–${TEMPLATE_NAME_MAX} characters`;
  }

  let items: TemplateItemValidated[] | null = null;
  if (data.items !== undefined) {
    const parsed = parseTemplateItemsFromObjects(data.items);
    if (!parsed.ok) errors.items = parsed.error;
    else items = parsed.items;
  } else {
    items = parseTemplateItemsFromNames(data.exerciseNames);
    if (!items) {
      errors.items = `Template must have ${TEMPLATE_ITEMS_MIN}–${TEMPLATE_ITEMS_MAX} exercises`;
    }
  }

  if (Object.keys(errors).length > 0 || !items) return { ok: false, errors };
  return { ok: true, data: { name: name.slice(0, TEMPLATE_NAME_MAX), items } };
}

export function validateTemplateUpdate(data: {
  name?: unknown;
  items?: unknown;
}): { ok: true; data: { name?: string; items: TemplateItemValidated[] } } | { ok: false; errors: TemplateFormErrors } {
  const errors: TemplateFormErrors = {};
  let name: string | undefined;
  if (data.name !== undefined) {
    const nameRaw = typeof data.name === "string" ? data.name : "";
    const trimmed = nameRaw.trim();
    if (trimmed.length < TEMPLATE_NAME_MIN || trimmed.length > TEMPLATE_NAME_MAX) {
      errors.name = `Name must be ${TEMPLATE_NAME_MIN}–${TEMPLATE_NAME_MAX} characters`;
    } else {
      name = trimmed;
    }
  }
  let items: TemplateItemValidated[] = [];
  if (data.items !== undefined) {
    const parsed = parseTemplateItemsFromObjects(data.items);
    if (!parsed.ok) errors.items = parsed.error;
    else items = parsed.items;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { name, items } };
}
