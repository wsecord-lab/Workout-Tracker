import { create } from "zustand";

export type TrainerCatalogItem = { id: string; name: string; isArchived: boolean };

type State = {
  byTrainer: Record<string, TrainerCatalogItem[]>;
  setForTrainer: (trainerId: string, items: TrainerCatalogItem[]) => void;
  addItem: (trainerId: string, item: TrainerCatalogItem) => void;
  getForTrainer: (trainerId: string) => TrainerCatalogItem[];
};

export const useExerciseCatalogStore = create<State>((set, get) => ({
  byTrainer: {},
  setForTrainer: (trainerId, items) =>
    set((s) => ({
      byTrainer: { ...s.byTrainer, [trainerId]: items.filter((i) => !i.isArchived) },
    })),
  addItem: (trainerId, item) =>
    set((s) => {
      const list = s.byTrainer[trainerId] ?? [];
      if (list.some((i) => i.id === item.id || i.name.toLowerCase() === item.name.toLowerCase()))
        return s;
      return {
        byTrainer: {
          ...s.byTrainer,
          [trainerId]: [...list, item].sort((a, b) => a.name.localeCompare(b.name)),
        },
      };
    }),
  getForTrainer: (trainerId) => get().byTrainer[trainerId] ?? [],
}));
