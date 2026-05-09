/** Calendar grid keys: YYYY-MM-DD */

export const CALENDAR_DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** For `@db.Date` fields stored as civil calendar dates (UTC midnight). */
export function parseCalendarDateKeyToUtcMidnight(dateKey: string): Date | null {
  const m = dateKey.trim().match(CALENDAR_DATE_KEY_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/** Local noon on calendar civil date — matches grouping from calendar grid day integers. */
export function parseCalendarDateKeyToLocalNoon(dateKey: string): Date | null {
  const m = dateKey.trim().match(CALENDAR_DATE_KEY_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}
