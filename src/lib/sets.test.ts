import { describe, it, expect } from "vitest";
import {
  isCompletedSet,
  isPlannedOnly,
  planDiffers,
  summarizeExerciseSets,
  formatPlanVsActual,
  type SetLike,
} from "./sets";

const done = new Date("2026-07-01T12:00:00Z");

/** 100 kg ≈ 220.5 lb, 80 kg ≈ 176.4 lb — matches formatWeight's 1-decimal rounding. */
function set(over: Partial<SetLike> = {}): SetLike {
  return {
    weightKg: 100,
    reps: 5,
    plannedWeightKg: null,
    plannedReps: null,
    completedAt: done,
    ...over,
  };
}

describe("isCompletedSet / isPlannedOnly", () => {
  it("treats a null completedAt as planned", () => {
    expect(isCompletedSet(set({ completedAt: null }))).toBe(false);
    expect(isPlannedOnly(set({ completedAt: null }))).toBe(true);
  });
  it("treats a set with completedAt as done", () => {
    expect(isCompletedSet(set())).toBe(true);
    expect(isPlannedOnly(set())).toBe(false);
  });
});

describe("planDiffers", () => {
  it("is false when the set matched its plan", () => {
    expect(planDiffers(set({ plannedWeightKg: 100, plannedReps: 5 }))).toBe(false);
  });
  it("is true when weight or reps came out different", () => {
    expect(planDiffers(set({ plannedWeightKg: 110, plannedReps: 5 }))).toBe(true);
    expect(planDiffers(set({ plannedWeightKg: 100, plannedReps: 8 }))).toBe(true);
  });
  it("is false for an ad-hoc set that was never planned", () => {
    expect(planDiffers(set())).toBe(false);
  });
  it("is false for a set that was planned but never performed", () => {
    expect(
      planDiffers(set({ completedAt: null, plannedWeightKg: 110, plannedReps: 5 }))
    ).toBe(false);
  });
});

describe("summarizeExerciseSets", () => {
  it("counts completed vs skipped", () => {
    const s = summarizeExerciseSets([
      set(),
      set(),
      set({ completedAt: null, plannedWeightKg: 100, plannedReps: 5 }),
    ]);
    expect(s).toMatchObject({ totalCount: 3, completedCount: 2, skippedCount: 1 });
  });

  it("collapses uniform sets into NxR notation", () => {
    const s = summarizeExerciseSets([set(), set(), set()]);
    expect(s.completedLabel).toBe("3×5 @ 220.5 lb");
  });

  it("lists sets individually when they are not uniform", () => {
    const s = summarizeExerciseSets([set(), set({ weightKg: 80, reps: 8 })]);
    expect(s.completedLabel).toBe("5 @ 220.5 lb, 8 @ 176.4 lb");
  });

  it("builds the plan label from snapshots on completed sets and from planned-only sets", () => {
    const s = summarizeExerciseSets([
      // Performed heavier than planned — the plan label should show the plan.
      set({ weightKg: 110, reps: 5, plannedWeightKg: 100, plannedReps: 5 }),
      set({ completedAt: null, plannedWeightKg: 100, plannedReps: 5 }),
    ]);
    expect(s.plannedLabel).toBe("2×5 @ 220.5 lb");
    expect(s.completedLabel).toBe("1×5 @ 242.5 lb");
  });

  it("has no plan label when nothing was planned", () => {
    expect(summarizeExerciseSets([set(), set()]).plannedLabel).toBeNull();
  });

  it("returns nulls for an empty exercise", () => {
    expect(summarizeExerciseSets([])).toEqual({
      totalCount: 0,
      completedCount: 0,
      skippedCount: 0,
      plannedLabel: null,
      completedLabel: null,
    });
  });
});

describe("formatPlanVsActual", () => {
  it("describes the gap between plan and result", () => {
    expect(formatPlanVsActual(set({ weightKg: 80, plannedWeightKg: 100, plannedReps: 5 }))).toBe(
      "planned 220.5 lb×5 → did 176.4 lb×5"
    );
  });
  it("is null when there is no gap to describe", () => {
    expect(formatPlanVsActual(set({ plannedWeightKg: 100, plannedReps: 5 }))).toBeNull();
    expect(formatPlanVsActual(set())).toBeNull();
  });
});
