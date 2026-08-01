export type DurationSource = {
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  /** Manual override in seconds. Null means "derive it". */
  durationSeconds: number | null;
};

export const MIN_DURATION_MINUTES = 1;
export const MAX_DURATION_MINUTES = 1440; // 24h

function toTime(v: Date | string | null): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Effective duration in seconds, or null when it can't be known.
 *
 * A manual override always wins — it's how a session that was never started
 * (or was left running overnight because nobody hit Finish) gets a real number.
 * A negative computed span means the clocks disagree or a date was edited by
 * hand; that yields null rather than 0, because "0 min" reads as a confident
 * measurement and null reads as "unknown", which is the truth.
 */
export function getSessionDurationSeconds(s: DurationSource): number | null {
  if (s.durationSeconds != null) return s.durationSeconds;
  const start = toTime(s.startedAt);
  const finish = toTime(s.finishedAt);
  if (start == null || finish == null) return null;
  const seconds = Math.round((finish - start) / 1000);
  return seconds >= 0 ? seconds : null;
}

/** Live elapsed time for a session that's still running. */
export function getElapsedSeconds(startedAt: Date | string, now: Date = new Date()): number {
  const start = toTime(startedAt);
  if (start == null) return 0;
  return Math.max(0, Math.round((now.getTime() - start) / 1000));
}

/** "48 min", "1h 04m", "0:52" for the live clock. Null renders as an em dash. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

/** "12:34" / "1:02:03" — the ticking clock inside workout mode. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  return hours > 0
    ? `${hours}:${mm}:${String(secs).padStart(2, "0")}`
    : `${mm}:${String(secs).padStart(2, "0")}`;
}

/**
 * Parse the editable minutes field.
 * - `null` clears the override (back to auto)
 * - `undefined` means the input was invalid, so don't write anything
 */
export function parseDurationMinutes(input: string): number | null | undefined {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const minutes = Number(trimmed);
  if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) return undefined;
  return minutes;
}
