"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { getClientSessionsInMonth } from "@/lib/db/workouts";
import type { CalendarSession } from "./SessionContentReadOnly";
import { SessionContentReadOnly } from "./SessionContentReadOnly";
import { SessionBlock } from "./SessionBlock";
import { markRestDay, clearRestDay } from "@/app/actions/rest-days";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type CalendarMonthSession = Awaited<ReturnType<typeof getClientSessionsInMonth>>[number];

function toDateKey(dateInput: string | Date): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const EX_PREVIEW_MAX = 4;

function exercisePreviewLines(daySessions: CalendarMonthSession[]): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  const multi = daySessions.length > 1;
  for (const s of daySessions) {
    const sessionLabel = ((s.name ?? "").trim() || "Session").slice(0, 14);
    const prefix = multi ? `${sessionLabel}: ` : "";
    for (const ex of s.exercises ?? []) {
      const name = (ex.name ?? "").trim() || "Exercise";
      const line = `${prefix}${name}`;
      if (seen.has(line)) continue;
      seen.add(line);
      lines.push(line);
    }
  }
  return lines;
}

type RestDayRow = { id: string; dateKey: string; notes: string | null };

type Props = {
  clientId: string;
  year: number;
  month: number;
  sessions: CalendarMonthSession[];
  restDays: RestDayRow[];
  isTrainer: boolean;
  catalog: { id: string; name: string }[];
  trainerId: string | null;
};

export function CalendarClient({
  clientId,
  year,
  month,
  sessions: sessionsProp,
  restDays,
  isTrainer,
  catalog,
  trainerId,
}: Props) {
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [showExercisePreview, setShowExercisePreview] = useState(false);
  const [restNotesDraft, setRestNotesDraft] = useState("");
  const [restError, setRestError] = useState<string | null>(null);
  const [restPending, startRestTransition] = useTransition();
  const sessions = Array.isArray(sessionsProp) ? sessionsProp : [];

  const restByDateKey = useMemo(() => {
    const m: Record<string, RestDayRow> = {};
    for (const r of restDays) {
      m[r.dateKey] = r;
    }
    return m;
  }, [restDays]);

  const { sessionsByDay, gridWeeks } = useMemo(() => {
    const byDay: Record<string, CalendarMonthSession[]> = {};
    for (const s of sessions) {
      if (!s || typeof s.date === "undefined" || s.date === null) continue;
      const key = toDateKey(s.date as Date | string);
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(s);
    }

    const first = new Date(year, month - 1, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const totalCells = 42;
    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = [];
    for (let i = 0; i < totalCells; i++) {
      if (i < startOffset || i >= startOffset + daysInMonth) {
        week.push(null);
      } else {
        week.push(i - startOffset + 1);
      }
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    return { sessionsByDay: byDay, gridWeeks: weeks };
  }, [year, month, sessions]);

  const prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const selectedSessions = selectedDateKey ? sessionsByDay[selectedDateKey] ?? [] : [];
  const selectedDateLabel = selectedDateKey
    ? new Date(selectedDateKey + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const selectedRest = selectedDateKey ? restByDateKey[selectedDateKey] : undefined;

  function handleMarkRest() {
    if (!selectedDateKey || !isTrainer) return;
    setRestError(null);
    startRestTransition(async () => {
      const result = await markRestDay(clientId, selectedDateKey, restNotesDraft.trim() || null);
      if (!result.ok) setRestError(result.error ?? "Could not save rest day");
      else setRestNotesDraft("");
    });
  }

  function handleClearRest() {
    if (!selectedDateKey || !isTrainer) return;
    setRestError(null);
    startRestTransition(async () => {
      const result = await clearRestDay(clientId, selectedDateKey);
      if (!result.ok) setRestError(result.error ?? "Could not clear rest day");
    });
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-[var(--text)]">{monthLabel}</h2>
          <div className="flex flex-wrap gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded border border-border bg-surface px-3 py-2 text-sm text-[var(--text)] tap-target">
              <input
                type="checkbox"
                checked={showExercisePreview}
                onChange={(e) => setShowExercisePreview(e.target.checked)}
                className="rounded border-border"
              />
              Show exercises
            </label>
            <Link
              href={`/clients/${clientId}/calendar?year=${prevMonth.year}&month=${prevMonth.month}`}
              className="btn-secondary text-sm tap-target flex-1 sm:flex-initial"
            >
              ← Prev
            </Link>
            <Link
              href={`/clients/${clientId}/calendar?year=${nextMonth.year}&month=${nextMonth.month}`}
              className="btn-secondary text-sm tap-target flex-1 sm:flex-initial"
            >
              Next →
            </Link>
          </div>
        </div>

        <div className="rounded border border-border bg-surface overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border text-[10px] sm:text-xs md:text-sm">
            {WEEKDAYS.map((d) => (
              <div key={d} className="table-header text-center py-1.5 sm:py-2 truncate">
                {d}
              </div>
            ))}
          </div>
          {gridWeeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((day, di) => {
                if (day === null) {
                  return (
                    <div
                      key={di}
                      className="min-h-[44px] sm:min-h-[60px] md:min-h-[80px] border-b border-border p-1 sm:p-2 bg-background/50"
                    />
                  );
                }
                const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const daySessions = sessionsByDay[dateKey] ?? [];
                const hasSessions = daySessions.length > 0;
                const hasRest = !!restByDateKey[dateKey];
                const isSelected = selectedDateKey === dateKey;
                const previewLines = showExercisePreview ? exercisePreviewLines(daySessions) : [];
                return (
                  <button
                    key={di}
                    type="button"
                    onClick={() => setSelectedDateKey(dateKey)}
                    className={`min-h-[44px] sm:min-h-[60px] md:min-h-[80px] border-b border-border p-1 sm:p-2 text-left outline-none focus:ring-2 focus:ring-primary focus:ring-inset rounded-none tap-target ${
                      hasSessions
                        ? "bg-primary/10 hover:bg-primary/20 cursor-pointer"
                        : "bg-surface hover:bg-background cursor-pointer"
                    } ${hasRest ? "border-l-[3px] border-l-secondary bg-secondary/[0.06]" : ""} ${
                      isSelected ? "ring-2 ring-primary ring-inset" : ""
                    }`}
                  >
                    <span className="text-sm font-medium text-[var(--text)]">{day}</span>
                    {hasRest && (
                      <span className="mt-0.5 block text-[10px] font-medium text-secondary truncate">
                        Rest
                      </span>
                    )}
                    {hasSessions && (
                      <span className="mt-0.5 block text-[10px] sm:text-xs text-muted">
                        {daySessions.length} session{daySessions.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {showExercisePreview && previewLines.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-[10px] sm:text-[11px] text-[var(--text)] leading-tight">
                        {previewLines.slice(0, EX_PREVIEW_MAX).map((line, li) => (
                          <li key={`${line}-${li}`} className="truncate" title={line}>
                            {line}
                          </li>
                        ))}
                        {previewLines.length > EX_PREVIEW_MAX && (
                          <li className="text-muted">+{previewLines.length - EX_PREVIEW_MAX} more</li>
                        )}
                      </ul>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedDateKey && (
        <div className="w-full lg:w-96 lg:min-w-[24rem] lg:sticky lg:top-4 rounded border border-border bg-surface p-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-semibold text-[var(--text)] text-sm sm:text-base truncate min-w-0">{selectedDateLabel}</h3>
            <button
              type="button"
              onClick={() => setSelectedDateKey(null)}
              className="tap-target shrink-0 text-muted hover:text-[var(--text)] outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {selectedRest && !isTrainer && (
            <p className="mb-4 text-sm text-muted border-b border-border pb-4">
              Scheduled rest day
              {selectedRest.notes?.trim() ? ` — ${selectedRest.notes.trim()}` : ""}
            </p>
          )}

          {isTrainer && (
            <div className="mb-4 space-y-3 border-b border-border pb-4">
              {selectedRest ? (
                <>
                  <p className="text-sm font-medium text-[var(--text)]">Scheduled rest day</p>
                  {selectedRest.notes?.trim() ? (
                    <p className="text-sm text-muted whitespace-pre-wrap">{selectedRest.notes.trim()}</p>
                  ) : null}
                  <button
                    type="button"
                    disabled={restPending}
                    onClick={handleClearRest}
                    className="btn-secondary text-sm tap-target"
                  >
                    {restPending ? "…" : "Clear rest day"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-[var(--text)]">Rest day</p>
                  <label className="block text-xs text-muted mb-1" htmlFor="calendar-rest-notes">
                    Note (optional)
                  </label>
                  <textarea
                    id="calendar-rest-notes"
                    value={restNotesDraft}
                    onChange={(e) => setRestNotesDraft(e.target.value)}
                    rows={2}
                    className="input w-full text-sm py-1.5 resize-y min-h-[48px]"
                    disabled={restPending}
                  />
                  <button
                    type="button"
                    disabled={restPending}
                    onClick={handleMarkRest}
                    className="btn-primary text-sm tap-target"
                  >
                    {restPending ? "…" : "Mark rest day"}
                  </button>
                </>
              )}
              {restError && (
                <p className="text-sm text-error" role="alert">
                  {restError}
                </p>
              )}
            </div>
          )}

          <div className="space-y-4">
            {selectedSessions.length === 0 ? (
              <p className="text-sm text-muted">No sessions on this day.</p>
            ) : isTrainer ? (
              selectedSessions.map((session) => (
                <SessionBlock
                  key={session.id}
                  session={session}
                  catalog={catalog}
                  trainerId={trainerId}
                  showPreviousBest
                  canAddNewExercise
                  defaultExpanded
                />
              ))
            ) : (
              selectedSessions.map((session) => (
                <SessionContentReadOnly
                  key={session.id}
                  session={sessionForReadOnly(session)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function sessionForReadOnly(session: CalendarMonthSession): CalendarSession {
  return {
    id: String(session.id),
    name: session.name != null ? String(session.name) : null,
    date: typeof session.date === "string" ? session.date : new Date(session.date).toISOString(),
    clientId: String(session.clientId),
    exercises: (session.exercises ?? []).map((e) => ({
      id: String(e.id),
      name: String(e.name ?? ""),
      sessionId: String(e.sessionId),
      catalogExerciseId: e.catalogExerciseId != null ? String(e.catalogExerciseId) : null,
      sets: (e.sets ?? []).map((set) => ({
        id: String(set.id),
        weightKg: Number(set.weightKg) || 0,
        reps: Number(set.reps) || 0,
        rpe: set.rpe != null ? Number(set.rpe) : null,
        notes: set.notes != null ? String(set.notes) : null,
        exerciseId: String(set.exerciseId),
      })),
    })),
  };
}
