/**
 * Server-side input sanitization for XSS hardening.
 * User-supplied free text (notes, client names, exercise names, session names)
 * is stripped of HTML and length-limited before storage, so stored strings
 * remain safe even if a future UI uses dangerouslySetInnerHTML.
 */

const HTML_TAG_REGEX = /<[^>]*>/g;

/** Strip HTML tags from a string; result is plain text safe for storage/display. */
export function stripHtml(value: string): string {
  return value.replace(HTML_TAG_REGEX, "");
}

export const NOTES_MAX_LENGTH = 2000;
export const CLIENT_NAME_MAX_LENGTH = 200;
export const EXERCISE_NAME_MAX_LENGTH = 120;
export const SESSION_NAME_MAX_LENGTH = 200;

/**
 * Sanitize notes: strip HTML, enforce max length. Empty/blank → null.
 */
export function sanitizeNotes(
  value: string | null | undefined,
  maxLen: number = NOTES_MAX_LENGTH
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const stripped = stripHtml(trimmed);
  if (stripped === "") return null;
  return stripped.length > maxLen ? stripped.slice(0, maxLen) : stripped;
}

/**
 * Sanitize a name field (client, exercise, session): strip HTML, enforce max length.
 * Returns trimmed plain text; caller should validate non-empty if required.
 */
export function sanitizeName(value: string, maxLen: number): string {
  const trimmed = (value ?? "").trim();
  const stripped = stripHtml(trimmed);
  return stripped.length > maxLen ? stripped.slice(0, maxLen) : stripped;
}
