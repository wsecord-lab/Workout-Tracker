/**
 * Lifting tempo, stored on a set as "eccentric-isometric-concentric", e.g.
 * "3-1-1" (3s lower, 1s pause, 1s lift) or "4-0-X" (X = explosive).
 */

/** Dropdown choices for each phase, in order. Blank (no tempo) is separate. */
export const TEMPO_VALUES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "X"] as const;

export type TempoParts = [string, string, string];
export const EMPTY_TEMPO: TempoParts = ["", "", ""];

function normalizePart(part: string): string {
  const p = part.trim().toUpperCase();
  // "03" → "3"; keeps "0" and "10".
  return /^\d+$/.test(p) ? String(parseInt(p, 10)) : p;
}

function isValidPart(part: string): boolean {
  return (TEMPO_VALUES as readonly string[]).includes(part);
}

/**
 * Validate a tempo from a form or API. All three phases or none:
 * blank → null; "3-1-1" (or "3 1 1", "3/1/1") → "3-1-1"; anything partial or out
 * of range is an error.
 */
export function parseTempo(
  input: unknown
): { ok: true; tempo: string | null } | { ok: false; error: string } {
  if (input == null) return { ok: true, tempo: null };
  if (typeof input !== "string") return { ok: false, error: "Tempo must be text like 3-1-1." };
  const raw = input.trim();
  if (raw === "" || /^[-\s/]*$/.test(raw)) return { ok: true, tempo: null };
  const parts = raw.split(/\s*[-/\s]\s*/);
  if (parts.length !== 3 || parts.some((p) => p === "")) {
    return { ok: false, error: "Pick all three tempo numbers, or leave all three blank." };
  }
  const normalized = parts.map(normalizePart);
  if (!normalized.every(isValidPart)) {
    return { ok: false, error: "Each tempo number must be 0–10 or X." };
  }
  return { ok: true, tempo: normalized.join("-") };
}

/** Join three dropdown values into the stored form ("" when all blank). */
export function joinTempo(parts: TempoParts): string {
  return parts.every((p) => p === "") ? "" : parts.join("-");
}

/** Split a stored tempo back into dropdown values. */
export function splitTempo(tempo: string | null | undefined): TempoParts {
  const parsed = parseTempo(tempo ?? null);
  if (!parsed.ok || parsed.tempo == null) return [...EMPTY_TEMPO];
  const [e, i, c] = parsed.tempo.split("-");
  return [e, i, c];
}

/** "3s lower · 1s pause · 1s lift"; X reads as "explosive", a 0 pause as "no pause". */
export function describeTempo(tempo: string | null | undefined): string | null {
  const parsed = parseTempo(tempo ?? null);
  if (!parsed.ok || parsed.tempo == null) return null;
  const [e, i, c] = parsed.tempo.split("-");
  const phase = (v: string, verb: string) => (v === "X" ? `explosive ${verb}` : `${v}s ${verb}`);
  const pause = i === "X" ? "explosive pause" : i === "0" ? "no pause" : `${i}s pause`;
  return `${phase(e, "lower")} · ${pause} · ${phase(c, "lift")}`;
}
