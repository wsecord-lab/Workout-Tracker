"use client";

import { formatWeight } from "@/lib/units";

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
    sets: {
      id: string;
      weightKg: number;
      reps: number;
      rpe: number | null;
      notes: string | null;
      exerciseId: string;
    }[];
  }[];
};

function SetReadOnly({
  set,
}: {
  set: { weightKg: number; reps: number; rpe?: number | null; notes?: string | null };
}) {
  const parts = [`${formatWeight(set.weightKg)} × ${set.reps} reps`];
  if (set.rpe != null) parts.push(`RPE ${set.rpe}`);
  if (set.notes?.trim()) parts.push(set.notes.trim());
  return (
    <li className="text-sm text-[var(--text)]">
      {parts.join(" · ")}
    </li>
  );
}

export function SessionContentReadOnly({ session }: { session: CalendarSession }) {
  const dateStr = new Date(session.date).toLocaleDateString("en-US", {
    weekday: "short",
    dateStyle: "medium",
  });
  const name = session.name?.trim() || "Session";
  const exercises = session.exercises ?? [];

  return (
    <section className="card">
      <h3 className="text-lg font-semibold text-[var(--text)]">{name}</h3>
      <p className="mt-1 text-sm text-muted">{dateStr}</p>
      <div className="mt-4 space-y-3">
        {exercises.map((exercise) => {
          const sets = exercise.sets ?? [];
          return (
            <div
              key={exercise.id}
              className="rounded border border-border bg-background p-3"
            >
              <h4 className="mb-2 font-medium text-[var(--text)]">{exercise.name}</h4>
              <ul className="space-y-1">
                {sets.map((s) => (
                  <SetReadOnly key={s.id} set={s} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
