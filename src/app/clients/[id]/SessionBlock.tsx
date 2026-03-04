"use client";

import { useState, useTransition } from "react";
import type { WorkoutSession, Exercise, Set } from "@prisma/client";
import { updateSessionName } from "@/app/actions/sessions";
import { AddExerciseForm } from "./AddExerciseForm";
import { DeleteSessionButton } from "./DeleteSessionButton";
import { ExerciseRow } from "./ExerciseRow";

type ExerciseWithSets = Exercise & { sets: Set[] };
type SessionWithExercises = WorkoutSession & { exercises: ExerciseWithSets[] };
type CatalogItem = { id: string; name: string };

function formatSessionDate(date: Date): string {
  const d = new Date(date);
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const medium = d.toLocaleDateString("en-US", { dateStyle: "medium" });
  return `${weekday} · ${medium}`;
}

export function SessionBlock({
  session,
  catalog,
}: {
  session: SessionWithExercises;
  catalog: CatalogItem[];
}) {
  const [expanded, setExpanded] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(session.name ?? "");
  const [isPending, startTransition] = useTransition();
  const dateStr = formatSessionDate(session.date);
  const exerciseCount = session.exercises.length;

  function handleSaveName() {
    const value = editNameValue.trim() || null;
    if (value === (session.name ?? null)) {
      setEditingName(false);
      return;
    }
    startTransition(async () => {
      await updateSessionName(session.id, session.clientId, value);
      setEditingName(false);
    });
  }

  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-left outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
      >
        <div className="min-w-0 flex-1">
          {session.name ? (
            <h3 className="text-lg font-semibold text-[var(--text)] truncate">{session.name}</h3>
          ) : null}
          <p className={`text-sm ${session.name ? "text-muted mt-0.5" : "font-semibold text-[var(--text)]"}`}>
            {dateStr}
          </p>
        </div>
        <span className="flex items-center gap-2 text-sm text-muted shrink-0 ml-2">
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
          <div className="flex items-center gap-2">
            {editingName ? (
              <>
                <input
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  placeholder="Session name"
                  className="input flex-1 py-1.5 text-sm"
                  disabled={isPending}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") {
                      setEditNameValue(session.name ?? "");
                      setEditingName(false);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={isPending}
                  className="btn-primary text-sm py-1.5"
                >
                  {isPending ? "…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditNameValue(session.name ?? "");
                    setEditingName(false);
                  }}
                  disabled={isPending}
                  className="btn-secondary text-sm py-1.5"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditNameValue(session.name ?? "");
                  setEditingName(true);
                }}
                className="text-sm text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
              >
                Edit name
              </button>
            )}
          </div>
          {session.exercises.map((exercise) => (
            <ExerciseRow key={exercise.id} exercise={exercise} />
          ))}
          <AddExerciseForm sessionId={session.id} catalog={catalog} />
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
