"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CalendarSession } from "./SessionContentReadOnly";
import { SessionContentReadOnly } from "./SessionContentReadOnly";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(dateInput: string | Date): string {
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Props = {
  clientId: string;
  clientName: string;
  year: number;
  month: number;
  sessions: CalendarSession[];
};

export function CalendarClient({ clientId, clientName, year, month, sessions: sessionsProp }: Props) {
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const sessions = Array.isArray(sessionsProp) ? sessionsProp : [];

  const { sessionsByDay, gridWeeks } = useMemo(() => {
    const byDay: Record<string, CalendarSession[]> = {};
    for (const s of sessions) {
      if (!s || typeof s.date !== "string") continue;
      const key = toDateKey(s.date);
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

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[var(--text)]">{monthLabel}</h2>
          <div className="flex gap-2">
            <Link
              href={`/clients/${clientId}/calendar?year=${prevMonth.year}&month=${prevMonth.month}`}
              className="btn-secondary text-sm"
            >
              ← Prev
            </Link>
            <Link
              href={`/clients/${clientId}/calendar?year=${nextMonth.year}&month=${nextMonth.month}`}
              className="btn-secondary text-sm"
            >
              Next →
            </Link>
          </div>
        </div>

        <div className="rounded border border-border bg-surface overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="table-header text-center"
              >
                {d}
              </div>
            ))}
          </div>
          {gridWeeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((day, di) => {
                if (day === null) {
                  return <div key={di} className="min-h-[80px] border-b border-border p-2 bg-background/50" />;
                }
                const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const daySessions = sessionsByDay[dateKey] ?? [];
                const hasSessions = daySessions.length > 0;
                const isSelected = selectedDateKey === dateKey;
                return (
                  <button
                    key={di}
                    type="button"
                    onClick={() => setSelectedDateKey(dateKey)}
                    className={`min-h-[80px] border-b border-border p-2 text-left outline-none focus:ring-2 focus:ring-primary focus:ring-inset rounded-none ${
                      hasSessions
                        ? "bg-primary/10 hover:bg-primary/20 cursor-pointer"
                        : "bg-surface hover:bg-background cursor-pointer"
                    } ${isSelected ? "ring-2 ring-primary ring-inset" : ""}`}
                  >
                    <span className="text-sm font-medium text-[var(--text)]">{day}</span>
                    {hasSessions && (
                      <span className="mt-1 block text-xs text-muted">
                        {daySessions.length} session{daySessions.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedDateKey && (
        <div className="w-full lg:w-96 lg:min-w-[24rem] lg:sticky lg:top-4 rounded border border-border bg-surface p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-[var(--text)]">{selectedDateLabel}</h3>
            <button
              type="button"
              onClick={() => setSelectedDateKey(null)}
              className="text-muted hover:text-[var(--text)] outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="space-y-4">
            {selectedSessions.length === 0 ? (
              <p className="text-sm text-muted">No sessions on this day.</p>
            ) : (
              selectedSessions.map((session) => (
                <SessionContentReadOnly key={session.id} session={session} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
