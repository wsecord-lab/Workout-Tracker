"use client";

import type { WorkoutSession, Exercise, Set } from "@prisma/client";
import { formatWeight } from "@/lib/units";

type ExerciseWithSets = Exercise & { sets: Set[] };
type SessionWithExercises = WorkoutSession & { exercises: ExerciseWithSets[] };

function SetReadOnly({ set }: { set: Set }) {
  const parts = [`${formatWeight(set.weightKg)} × ${set.reps} reps`];
  if (set.rpe != null) parts.push(`RPE ${set.rpe}`);
  if (set.notes?.trim()) parts.push(set.notes.trim());
  return (
    <li className="text-sm text-[var(--text)]">
      {parts.join(" · ")}
    </li>
  );
}

export function SessionContentReadOnly({ session }: { session: SessionWithExercises }) {
  const dateStr = new Date(session.date).toLocaleDateString("en-US", {
    weekday: "short",
    dateStyle: "medium",
  });
  const name = session.name?.trim() || "Session";

  return (
    <section className="card">
      <h3 className="text-lg font-semibold text-[var(--text)]">{name}</h3>
      <p className="mt-1 text-sm text-muted">{dateStr}</p>
      <div className="mt-4 space-y-3">
        {session.exercises.map((exercise) => (
          <div
            key={exercise.id}
            className="rounded border border-border bg-background p-3"
          >
            <h4 className="mb-2 font-medium text-[var(--text)]">{exercise.name}</h4>
            <ul className="space-y-1">
              {exercise.sets.map((s) => (
                <SetReadOnly key={s.id} set={s} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
