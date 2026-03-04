import type { Exercise, Set } from "@prisma/client";
import { AddSetForm } from "./AddSetForm";
import { DeleteExerciseButton } from "./DeleteExerciseButton";
import { SetRow } from "./SetRow";

type ExerciseWithSets = Exercise & { sets: Set[] };

export function ExerciseRow({ exercise }: { exercise: ExerciseWithSets }) {
  return (
    <div className="rounded border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="font-medium text-[var(--text)]">{exercise.name}</h4>
        <DeleteExerciseButton
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          hasSets={exercise.sets.length > 0}
        />
      </div>
      <ul className="mb-2 space-y-1">
        {exercise.sets.map((s) => (
          <SetRow key={s.id} set={s} />
        ))}
      </ul>
      <AddSetForm exerciseId={exercise.id} />
    </div>
  );
}
