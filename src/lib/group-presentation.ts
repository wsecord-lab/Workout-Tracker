/**
 * Superset / Tri-set / Giant set grouping: compute label and color per exercise from groupId.
 * Letter assignment is stable by earliest orderIndex in the session.
 */

export type GroupPresentation = {
  label: string;
  letter: string;
  /** Tailwind border-l class for left accent */
  borderClass: string;
  /** Tailwind classes for chip */
  chipClass: string;
  /** Tailwind classes for subtle card background tint */
  cardTintClass: string;
};

type ExerciseForGroup = { id: string; groupId: string | null; orderIndex: number };

const GROUP_PALETTE: { border: string; chip: string; cardTint: string }[] = [
  { border: "border-l-blue-500", chip: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200 border-blue-300 dark:border-blue-700", cardTint: "bg-blue-50/50 dark:bg-blue-950/25" },
  { border: "border-l-emerald-500", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700", cardTint: "bg-emerald-50/50 dark:bg-emerald-950/25" },
  { border: "border-l-amber-500", chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 border-amber-300 dark:border-amber-700", cardTint: "bg-amber-50/50 dark:bg-amber-950/25" },
  { border: "border-l-violet-500", chip: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200 border-violet-300 dark:border-violet-700", cardTint: "bg-violet-50/50 dark:bg-violet-950/25" },
  { border: "border-l-rose-500", chip: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200 border-rose-300 dark:border-rose-700", cardTint: "bg-rose-50/50 dark:bg-rose-950/25" },
  { border: "border-l-teal-500", chip: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200 border-teal-300 dark:border-teal-700", cardTint: "bg-teal-50/50 dark:bg-teal-950/25" },
  { border: "border-l-orange-500", chip: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200 border-orange-300 dark:border-orange-700", cardTint: "bg-orange-50/50 dark:bg-orange-950/25" },
  { border: "border-l-fuchsia-500", chip: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-200 border-fuchsia-300 dark:border-fuchsia-700", cardTint: "bg-fuchsia-50/50 dark:bg-fuchsia-950/25" },
];

function groupTypeLabel(size: number): "Superset" | "Tri-set" {
  if (size === 3) return "Tri-set";
  return "Superset"; // 2 or 4+ both use "Superset"
}

function letterForIndex(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export type GroupPresentationResult = {
  byExerciseId: Map<string, GroupPresentation>;
  uniqueGroups: { groupId: string; label: string }[];
};

/**
 * Compute label and color for each exercise that has a groupId.
 * - Letters A, B, C... by stable order: sort unique groupIds by min orderIndex of exercises in that group.
 * - Set type by group size: 2 = Superset, 3 = Tri-set, 4+ = Giant set.
 * - Color by group index (mod palette length).
 */
export function computeGroupPresentation(exercises: ExerciseForGroup[]): GroupPresentationResult {
  const byExerciseId = new Map<string, GroupPresentation>();
  const uniqueGroups: { groupId: string; label: string }[] = [];
  const withGroup = exercises.filter((e): e is ExerciseForGroup & { groupId: string } => !!e.groupId);
  if (withGroup.length === 0) return { byExerciseId, uniqueGroups };

  const byGroupId = new Map<string, ExerciseForGroup[]>();
  for (const ex of withGroup) {
    const list = byGroupId.get(ex.groupId) ?? [];
    list.push(ex);
    byGroupId.set(ex.groupId, list);
  }

  const sortedGroupIds = Array.from(byGroupId.keys()).sort((a, b) => {
    const minOrderA = Math.min(...byGroupId.get(a)!.map((e) => e.orderIndex));
    const minOrderB = Math.min(...byGroupId.get(b)!.map((e) => e.orderIndex));
    return minOrderA - minOrderB;
  });

  sortedGroupIds.forEach((groupId, index) => {
    const members = byGroupId.get(groupId)!;
    const size = members.length;
    const labelType = groupTypeLabel(size);
    const letter = letterForIndex(index);
    const label = `${labelType} ${letter}`;
    uniqueGroups.push({ groupId, label });
    const { border: borderClass, chip: chipClass, cardTint: cardTintClass } = GROUP_PALETTE[index % GROUP_PALETTE.length];
    for (const ex of members) {
      byExerciseId.set(ex.id, { label, letter, borderClass, chipClass, cardTintClass });
    }
  });

  return { byExerciseId, uniqueGroups };
}
