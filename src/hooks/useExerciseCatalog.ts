"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  addTrainerExercise,
  archiveTrainerExercise,
  listTrainerExercises,
} from "@/app/actions/trainer-exercises";
import type { TrainerCatalogItem } from "@/app/actions/trainer-exercises";
import { useExerciseCatalogStore } from "@/store/exercise-catalog";

const EMPTY_EXERCISES: { id: string; name: string; isArchived: boolean }[] = [];

export function useExerciseCatalog(trainerId: string | null) {
  const router = useRouter();
  const exercises = useExerciseCatalogStore((s) =>
    trainerId ? (s.byTrainer[trainerId] ?? EMPTY_EXERCISES) : EMPTY_EXERCISES
  );
  const setForTrainer = useExerciseCatalogStore((s) => s.setForTrainer);
  const addItem = useExerciseCatalogStore((s) => s.addItem);

  const refresh = useCallback(async () => {
    if (!trainerId) return;
    const list = await listTrainerExercises(false);
    setForTrainer(trainerId, list);
    router.refresh();
  }, [trainerId, setForTrainer, router]);

  const addExercise = useCallback(
    async (name: string): Promise<{ ok: true; item: TrainerCatalogItem } | { ok: false; error: string }> => {
      if (!trainerId) return { ok: false, error: "No trainer context." };
      const result = await addTrainerExercise(name);
      if (result.ok) addItem(trainerId, result.item);
      return result;
    },
    [trainerId, addItem]
  );

  const archiveExercise = useCallback(
    async (id: string) => {
      return archiveTrainerExercise(id);
    },
    []
  );

  return {
    exercises,
    addExercise,
    archiveExercise,
    refresh,
  };
}
