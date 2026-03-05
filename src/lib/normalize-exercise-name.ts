/** Normalize exercise name for matching: lowercase, collapse spaces, trim. */
export function normalizeExerciseName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
