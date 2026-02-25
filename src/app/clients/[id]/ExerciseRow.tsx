import type { Exercise, Set } from "@prisma/client";
import { AddSetForm } from "./AddSetForm";
import { SetRow } from "./SetRow";

type ExerciseWithSets = Exercise & { sets: Set[] };

export function ExerciseRow({ exercise }: { exercise: ExerciseWithSets }) {
  return (
    <div className="rounded border border-border bg-background p-3">
      <h4 className="mb-2 font-medium text-[var(--text)]">{exercise.name}</h4>
      <ul className="mb-2 space-y-1">
        {exercise.sets.map((s) => (
          <SetRow key={s.id} set={s} />
        ))}
      </ul>
      <AddSetForm exerciseId={exercise.id} />
    </div>
  );
}
