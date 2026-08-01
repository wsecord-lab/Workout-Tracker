"use client";

import { formatWeight } from "@/lib/units";

type CalendarSet = {
  id: string;
  weightKg: number;
  reps: number;
  rpe: number | null;
  notes: string | null;
  exerciseId: string;
  plannedWeightKg: number | null;
  plannedReps: number | null;
  completedAt: string | Date | null;
};

export type CalendarSession = {
  id: string;
  name: string | null;
  date: string;
  clientId: string;
  exercises: {
    id: string;
    name: string;
    sessionId: string;
    catalogExerciseId: string | null;
    sets: CalendarSet[];
  }[];
};

function formatSetDisplay(set: {
  weightKg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  notes?: string | null;
}) {
  const kg = set.weightKg != null && Number.isFinite(set.weightKg) ? set.weightKg : 0;
  const reps = set.reps != null && Number.isFinite(set.reps) ? set.reps : 0;
  const parts = [`${formatWeight(kg)} × ${reps} reps`];
  if (set.rpe != null && Number.isFinite(set.rpe)) parts.push(`RPE ${set.rpe}`);
  const notes = set.notes != null ? String(set.notes).trim() : "";
  if (notes) parts.push(notes);
  return parts.join(" · ");
}

function SetReadOnly({ set }: { set: Partial<CalendarSet> }) {
  const planned = set.completedAt == null;
  return (
    <li className={`text-sm ${planned ? "text-muted" : "text-[var(--text)]"}`}>
      {formatSetDisplay(set)}
      {planned && <span className="ml-2 text-xs italic">planned — not completed</span>}
    </li>
  );
}

export function SessionContentReadOnly({ session }: { session: CalendarSession }) {
  if (!session || typeof session.date !== "string") return null;
  const dateStr = new Date(session.date).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const name = (session.name != null ? String(session.name) : "").trim() || "Session";
  const exercises = Array.isArray(session.exercises) ? session.exercises : [];

  return (
    <section className="card">
      <h3 className="text-lg font-semibold text-[var(--text)]">{name}</h3>
      <p className="mt-1 text-sm text-muted">{dateStr}</p>
      <div className="mt-4 space-y-3">
        {exercises.map((exercise, idx) => {
          const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
          const exId = exercise?.id ?? `ex-${idx}`;
          const exName = exercise?.name != null ? String(exercise.name) : "Exercise";
          return (
            <div
              key={exId}
              className="rounded border border-border bg-background p-3"
            >
              <h4 className="mb-2 font-medium text-[var(--text)]">{exName}</h4>
              <ul className="space-y-1">
                {sets.map((s, si) => (
                  <SetReadOnly key={s?.id ?? `set-${idx}-${si}`} set={s ?? {}} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
