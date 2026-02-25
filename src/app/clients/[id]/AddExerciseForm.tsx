"use client";

import { useState, useTransition } from "react";
import { createExercise } from "@/app/actions/exercises";

export function AddExerciseForm({ sessionId }: { sessionId: string }) {
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="flex items-center gap-2 border-t border-dashed border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim();
        if (!n) return;
        startTransition(async () => {
          await createExercise(sessionId, n);
          setName("");
        });
      }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Exercise name"
        className="input flex-1 py-1.5 text-sm"
        disabled={isPending}
      />
      <button
        type="submit"
        disabled={isPending || !name.trim()}
        className="rounded bg-secondary px-3 py-1.5 text-sm text-white outline-none hover:bg-secondary-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add exercise"}
      </button>
    </form>
  );
}
