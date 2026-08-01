import { normalizeExerciseName } from "@/lib/normalize-exercise-name";

/**
 * Normalized form of a session name, used to match "the last Upper Body
 * workout" and to average durations across sessions of the same kind.
 *
 * Delegates to normalizeExerciseName so the two can never drift apart — the
 * rule (trim, collapse whitespace, lowercase) is already duplicated once in
 * validations.ts, and a third copy would be one too many.
 *
 * Unnamed sessions normalize to null: matching every unnamed session to every
 * other one is worse than matching none.
 */
export function normalizeSessionName(name: string | null | undefined): string | null {
  if (name == null) return null;
  const normalized = normalizeExerciseName(name);
  return normalized === "" ? null : normalized;
}
