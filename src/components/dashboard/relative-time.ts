/** Relative / calendar labels for the trainer dashboard. */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function civilDayDiff(from: Date, to: Date): number {
  const a = startOfLocalDay(from).getTime();
  const b = startOfLocalDay(to).getTime();
  return Math.round((b - a) / DAY_MS);
}

/**
 * Short relative label for an instant (startedAt / finishedAt).
 * Examples: "just now", "12 min ago", "3h ago", "Yesterday", "Mar 12".
 */
export function formatRelativeInstant(
  value: Date | string,
  now: Date = new Date()
): string {
  const t = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(t.getTime())) return "—";

  const delta = now.getTime() - t.getTime();
  if (delta < 0) {
    // Future instant — fall through to calendar wording
    return formatCalendarDay(t, now);
  }

  const days = civilDayDiff(t, now);
  if (days === 0) {
    if (delta < MINUTE_MS) return "just now";
    if (delta < HOUR_MS) {
      const mins = Math.floor(delta / MINUTE_MS);
      return `${mins} min ago`;
    }
    const hours = Math.floor(delta / HOUR_MS);
    return `${hours}h ago`;
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  return t.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(t.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  });
}

/**
 * Label for a session's scheduled calendar date.
 * Examples: "Today", "Tomorrow", "Mon, Mar 16".
 */
export function formatCalendarDay(
  value: Date | string,
  now: Date = new Date()
): string {
  const t = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(t.getTime())) return "—";

  const days = civilDayDiff(now, t);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";

  return t.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(t.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  });
}

/** Local midnight at the start of `now`'s civil day — for upcoming session queries. */
export function startOfToday(now: Date = new Date()): Date {
  return startOfLocalDay(now);
}
