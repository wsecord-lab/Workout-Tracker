"use client";

import { useState } from "react";
import type { WorkoutSession, Exercise, Set } from "@prisma/client";
import { AddExerciseForm } from "./AddExerciseForm";
import { DeleteSessionButton } from "./DeleteSessionButton";
import { ExerciseRow } from "./ExerciseRow";

type ExerciseWithSets = Exercise & { sets: Set[] };
type SessionWithExercises = WorkoutSession & { exercises: ExerciseWithSets[] };

export function SessionBlock({ session }: { session: SessionWithExercises }) {
  const [expanded, setExpanded] = useState(true);
  const dateStr = new Date(session.date).toLocaleDateString("en-US", {
    dateStyle: "medium",
  });
  const exerciseCount = session.exercises.length;

  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-left outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
      >
        <h3 className="text-lg font-semibold text-[var(--text)]">{dateStr}</h3>
        <span className="flex items-center gap-2 text-sm text-muted">
          {exerciseCount} exercise{exerciseCount !== 1 ? "s" : ""}
          <span
            className={`inline-block transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▼
          </span>
        </span>
      </button>
      {expanded && (
        <div className="mt-4 space-y-4">
          {session.exercises.map((exercise) => (
            <ExerciseRow key={exercise.id} exercise={exercise} />
          ))}
          <AddExerciseForm sessionId={session.id} />
          <div className="pt-2 border-t border-[var(--border)]">
            <DeleteSessionButton
              sessionId={session.id}
              clientId={session.clientId}
              dateStr={dateStr}
              hasContent={session.exercises.length > 0}
            />
          </div>
        </div>
      )}
    </section>
  );
}
