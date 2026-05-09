"use client";

import { useMemo, useState, useTransition, useRef, useEffect, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { getClientSessionsInMonth } from "@/lib/db/workouts";
import type { CalendarSession } from "./SessionContentReadOnly";
import { SessionContentReadOnly } from "./SessionContentReadOnly";
import { SessionBlock } from "./SessionBlock";
import { createSession, createSessionWithTemplate } from "@/app/actions/sessions";
import { listTemplates } from "@/app/actions/templates";
import { markRestDay, clearRestDay } from "@/app/actions/rest-days";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ADD_SESSION_MODAL_BACKDROP_Z = 1000;
const ADD_SESSION_MODAL_PANEL_Z = 1001;

export type CalendarMonthSession = Awaited<ReturnType<typeof getClientSessionsInMonth>>[number];

function toDateKey(dateInput: string | Date): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const EX_PREVIEW_MAX = 5;
const SESSION_NAMES_MAX_LINES = 3;

function sessionDisplayNames(daySessions: CalendarMonthSession[]): string[] {
  return daySessions.map((s) => ((s.name ?? "").trim() || "Session"));
}

function exercisePreviewLines(daySessions: CalendarMonthSession[]): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  const multi = daySessions.length > 1;
  for (const s of daySessions) {
    const sessionLabel = ((s.name ?? "").trim() || "Session").slice(0, 12);
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

function exercisePreviewSummary(lines: string[]): { text: string; title: string } {
  const shown = lines.slice(0, EX_PREVIEW_MAX);
  const extra = lines.length - shown.length;
  const text =
    extra > 0 ? `${shown.join(" · ")} · +${extra} more` : shown.join(" · ");
  return { text, title: lines.join("\n") };
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
  const router = useRouter();
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [showExercisePreview, setShowExercisePreview] = useState(false);
  const [restNotesDraft, setRestNotesDraft] = useState("");
  const [restError, setRestError] = useState<string | null>(null);
  const [restPending, startRestTransition] = useTransition();
  const [showAddSessionModal, setShowAddSessionModal] = useState(false);
  const [addSessionName, setAddSessionName] = useState("");
  const [addSessionTemplateId, setAddSessionTemplateId] = useState("");
  const [addTemplates, setAddTemplates] = useState<{ id: string; name: string }[]>([]);
  const [addSessionError, setAddSessionError] = useState<string | null>(null);
  const [addSessionPending, startAddSessionTransition] = useTransition();
  const sessions = Array.isArray(sessionsProp) ? sessionsProp : [];

  const restByDateKey = useMemo(() => {
    const m: Record<string, RestDayRow> = {};
    for (const r of restDays) {
      m[r.dateKey] = r;
    }
    return m;
  }, [restDays]);

  useEffect(() => {
    if (!selectedDateKey || typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    if (!mq.matches) return;
    const id = window.requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [selectedDateKey]);

  useEffect(() => {
    if (!showAddSessionModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showAddSessionModal]);

  useEffect(() => {
    if (!showAddSessionModal || !isTrainer) return;
    listTemplates(false).then((result) => {
      if (result.ok) {
        setAddTemplates(result.templates.map((t) => ({ id: t.id, name: t.name })));
      } else {
        setAddTemplates([]);
      }
    });
  }, [showAddSessionModal, isTrainer]);

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
      else {
        setRestNotesDraft("");
        router.refresh();
      }
    });
  }

  function handleClearRest() {
    if (!selectedDateKey || !isTrainer) return;
    setRestError(null);
    startRestTransition(async () => {
      const result = await clearRestDay(clientId, selectedDateKey);
      if (!result.ok) setRestError(result.error ?? "Could not clear rest day");
      else router.refresh();
    });
  }

  function closeAddSessionModal() {
    if (!addSessionPending) {
      setShowAddSessionModal(false);
      setAddSessionName("");
      setAddSessionTemplateId("");
      setAddSessionError(null);
    }
  }

  function handleAddSessionSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedDateKey) return;
    setAddSessionError(null);
    startAddSessionTransition(async () => {
      try {
        if (addSessionTemplateId.trim()) {
          const result = await createSessionWithTemplate(
            clientId,
            addSessionName.trim() || null,
            addSessionTemplateId,
            selectedDateKey
          );
          if (!result.ok) {
            setAddSessionError(result.error ?? "Could not create session");
            return;
          }
        } else {
          await createSession(clientId, addSessionName.trim() || null, selectedDateKey);
        }
        setShowAddSessionModal(false);
        setAddSessionName("");
        setAddSessionTemplateId("");
        setAddSessionError(null);
        router.refresh();
      } catch {
        setAddSessionError("Something went wrong");
      }
    });
  }

  const addSessionModal =
    showAddSessionModal &&
    selectedDateKey &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
        style={{ zIndex: ADD_SESSION_MODAL_BACKDROP_Z }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-add-session-title"
        onClick={closeAddSessionModal}
      >
        <form
          className="card max-h-[90vh] w-full max-w-sm space-y-4 overflow-y-auto"
          style={{ zIndex: ADD_SESSION_MODAL_PANEL_Z }}
          onClick={(ev) => ev.stopPropagation()}
          onSubmit={handleAddSessionSubmit}
        >
          <h2 id="calendar-add-session-title" className="text-lg font-semibold text-[var(--text)]">
            New workout
          </h2>
          <p className="text-sm text-muted">
            For{" "}
            <span className="font-medium text-[var(--text)]">
              {selectedDateLabel ?? selectedDateKey}
            </span>
          </p>
          <div>
            <label htmlFor="calendar-session-name" className="mb-1 block text-sm font-medium text-[var(--text)]">
              Session name (optional)
            </label>
            <input
              id="calendar-session-name"
              type="text"
              value={addSessionName}
              onChange={(e) => setAddSessionName(e.target.value)}
              placeholder="e.g. Push day"
              className="input py-1.5 text-sm"
              disabled={addSessionPending}
              autoFocus
            />
          </div>
          {isTrainer && (
            <div>
              <label htmlFor="calendar-session-template" className="mb-1 block text-sm font-medium text-[var(--text)]">
                Start from template (optional)
              </label>
              <select
                id="calendar-session-template"
                value={addSessionTemplateId}
                onChange={(e) => setAddSessionTemplateId(e.target.value)}
                className="input w-full py-1.5 text-sm"
                disabled={addSessionPending}
              >
                <option value="">No template</option>
                {addTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">Adds exercises from the template. No sets are added.</p>
            </div>
          )}
          {addSessionError && (
            <p className="text-sm text-error" role="alert">
              {addSessionError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeAddSessionModal} disabled={addSessionPending} className="btn-secondary text-sm py-1.5">
              Cancel
            </button>
            <button type="submit" disabled={addSessionPending} className="btn-primary text-sm py-1.5">
              {addSessionPending ? "Adding…" : "Create"}
            </button>
          </div>
        </form>
      </div>,
      document.body
    );

  return (
    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <div className="min-w-0 w-full flex-1">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)] sm:text-xl shrink-0">{monthLabel}</h2>
          <div className="flex min-w-0 flex-wrap items-stretch gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded border border-border bg-surface px-3 py-2 text-sm text-[var(--text)] min-h-[44px] touch-manipulation">
              <input
                type="checkbox"
                checked={showExercisePreview}
                onChange={(e) => setShowExercisePreview(e.target.checked)}
                className="rounded border-border shrink-0"
              />
              <span className="whitespace-nowrap">Show exercises</span>
            </label>
            <Link
              href={`/clients/${clientId}/calendar?year=${prevMonth.year}&month=${prevMonth.month}`}
              className="btn-secondary text-sm inline-flex flex-1 min-h-[44px] touch-manipulation sm:flex-initial"
            >
              ← Prev
            </Link>
            <Link
              href={`/clients/${clientId}/calendar?year=${nextMonth.year}&month=${nextMonth.month}`}
              className="btn-secondary text-sm inline-flex flex-1 min-h-[44px] touch-manipulation sm:flex-initial"
            >
              Next →
            </Link>
          </div>
        </div>

        <div className="rounded border border-border bg-surface overflow-hidden min-w-0">
          <div className="grid min-w-0 grid-cols-7 border-b border-border text-[10px] sm:text-xs md:text-sm">
            {WEEKDAYS.map((d) => (
              <div key={d} className="table-header text-center py-1.5 sm:py-2 truncate">
                {d}
              </div>
            ))}
          </div>
          {gridWeeks.map((week, wi) => (
            <div key={wi} className="grid min-w-0 grid-cols-7 isolate">
              {week.map((day, di) => {
                if (day === null) {
                  return (
                    <div
                      key={di}
                      className="min-h-[52px] sm:min-h-[64px] md:min-h-[76px] border-b border-border p-1 sm:p-1.5 bg-background/50 min-w-0"
                    />
                  );
                }
                const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const daySessions = sessionsByDay[dateKey] ?? [];
                const hasSessions = daySessions.length > 0;
                const hasRest = !!restByDateKey[dateKey];
                const isSelected = selectedDateKey === dateKey;
                const previewLines = showExercisePreview ? exercisePreviewLines(daySessions) : [];
                const preview =
                  previewLines.length > 0 ? exercisePreviewSummary(previewLines) : null;
                const sessionLabels = hasSessions ? sessionDisplayNames(daySessions) : [];
                const visibleSessionLabels = sessionLabels.slice(0, SESSION_NAMES_MAX_LINES);
                const extraSessionLabels = sessionLabels.length - visibleSessionLabels.length;
                const cellTitleParts: string[] = [];
                if (sessionLabels.length > 0) cellTitleParts.push(sessionLabels.join("\n"));
                if (preview?.title) cellTitleParts.push(preview.title);
                const cellTitle = cellTitleParts.length > 0 ? cellTitleParts.join("\n\n") : undefined;
                return (
                  <button
                    key={di}
                    type="button"
                    onClick={() => setSelectedDateKey(dateKey)}
                    title={cellTitle}
                    className={`relative z-0 min-h-[52px] min-w-0 max-w-full overflow-hidden border-b border-border p-1 sm:min-h-[64px] md:min-h-[76px] sm:p-1.5 text-left align-top outline-none focus:z-[1] focus:ring-2 focus:ring-primary focus:ring-inset rounded-none tap-target touch-manipulation flex flex-col items-stretch gap-0.5 ${
                      hasSessions
                        ? "bg-primary/10 hover:bg-primary/20 cursor-pointer active:bg-primary/25"
                        : "bg-surface hover:bg-background cursor-pointer active:bg-muted/30"
                    } ${hasRest ? "border-l-[3px] border-l-secondary bg-secondary/[0.06]" : ""} ${
                      isSelected ? "z-[1] ring-2 ring-primary ring-inset" : ""
                    }`}
                  >
                    <span className="shrink-0 text-sm font-medium leading-none text-[var(--text)]">{day}</span>
                    {hasRest && (
                      <span className="shrink-0 text-[9px] font-medium leading-tight text-secondary truncate">
                        Rest
                      </span>
                    )}
                    {hasSessions &&
                      visibleSessionLabels.map((label, li) => (
                        <span
                          key={li}
                          className="block min-h-0 truncate text-[9px] font-medium leading-tight text-[var(--text)] sm:text-[10px]"
                        >
                          {label}
                        </span>
                      ))}
                    {hasSessions && extraSessionLabels > 0 ? (
                      <span className="block truncate text-[9px] leading-tight text-muted sm:text-[10px]">
                        +{extraSessionLabels} more
                      </span>
                    ) : null}
                    {showExercisePreview && preview && (
                      <p className="mt-0.5 line-clamp-3 min-h-0 max-h-[3.25rem] text-[9px] leading-snug text-muted break-words hyphens-auto overflow-hidden sm:text-[10px] sm:max-h-[3.5rem]">
                        {preview.text}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedDateKey && (
        <div
          ref={detailPanelRef}
          id="calendar-day-detail"
          className="w-full min-w-0 scroll-mt-4 rounded-lg border border-border bg-surface p-3 shadow-sm sm:p-4 lg:w-[min(100%,26rem)] lg:max-w-md lg:shrink-0 lg:sticky lg:top-4 lg:shadow-none max-h-[min(70vh,640px)] lg:max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <h3 className="font-semibold text-[var(--text)] text-base leading-snug break-words min-w-0 flex-1">
              {selectedDateLabel}
            </h3>
            <button
              type="button"
              onClick={() => setSelectedDateKey(null)}
              className="tap-target shrink-0 rounded border border-transparent px-2 text-muted hover:bg-background hover:text-[var(--text)] hover:border-border outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 touch-manipulation min-h-[44px] min-w-[44px]"
              aria-label="Close day details"
            >
              ✕
            </button>
          </div>

          {selectedRest && !isTrainer && (
            <p className="mb-4 border-b border-border pb-4 text-sm text-muted">
              Scheduled rest day
              {selectedRest.notes?.trim() ? ` — ${selectedRest.notes.trim()}` : ""}
            </p>
          )}

          {isTrainer && selectedRest && (
            <div className="mb-4 space-y-2 rounded-md border border-border bg-secondary/[0.08] px-3 py-3">
              <p className="text-sm font-medium text-[var(--text)]">Rest day planned for this date</p>
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
            </div>
          )}

          {isTrainer && !selectedRest && (
            <details className="group mb-4 border-b border-border pb-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted hover:text-[var(--text)] [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="inline-block shrink-0 transition-transform group-open:rotate-90">
                  ▸
                </span>
                <span>Optional: plan a rest day</span>
              </summary>
              <div className="mt-3 space-y-3">
                <label className="mb-1 block text-xs text-muted" htmlFor="calendar-rest-notes">
                  Note (optional)
                </label>
                <textarea
                  id="calendar-rest-notes"
                  value={restNotesDraft}
                  onChange={(e) => setRestNotesDraft(e.target.value)}
                  rows={2}
                  className="input min-h-[48px] w-full resize-y py-1.5 text-sm"
                  disabled={restPending}
                />
                <button
                  type="button"
                  disabled={restPending}
                  onClick={handleMarkRest}
                  className="btn-primary text-sm tap-target"
                >
                  {restPending ? "…" : "Save rest day"}
                </button>
              </div>
            </details>
          )}

          {isTrainer && restError && (
            <p className="-mt-2 mb-4 text-sm text-error" role="alert">
              {restError}
            </p>
          )}

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setAddSessionError(null);
                setShowAddSessionModal(true);
              }}
              className="btn-primary text-sm min-h-[44px] flex-1 touch-manipulation sm:flex-initial"
            >
              Add workout
            </button>
          </div>

          <div className="space-y-4 min-w-0">
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
      {addSessionModal}
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
