import { describe, it, expect } from "vitest";
import type { Set as PrismaSet } from "@prisma/client";
import { pickBestSet } from "./progress";

const done = new Date("2026-07-01T12:00:00Z");

function set(over: Partial<PrismaSet> = {}): PrismaSet {
  return {
    id: "s1",
    weightKg: 100,
    reps: 5,
    plannedWeightKg: null,
    plannedReps: null,
    completedAt: done,
    rpe: null,
    notes: null,
    orderIndex: 0,
    exerciseId: "ex-1",
    createdAt: done,
    ...over,
  };
}

describe("pickBestSet", () => {
  it("picks the heaviest set", () => {
    expect(pickBestSet([set({ weightKg: 90 }), set({ weightKg: 110 })])).toEqual({
      weightKg: 110,
      reps: 5,
    });
  });

  it("breaks weight ties on reps", () => {
    expect(pickBestSet([set({ reps: 5 }), set({ reps: 8 })])).toEqual({
      weightKg: 100,
      reps: 8,
    });
  });

  it("ignores planned sets, even when they are the heaviest", () => {
    // The 200 kg row is a target the client never hit. Reporting it as a best
    // set would show progress that did not happen.
    const best = pickBestSet([set({ weightKg: 100 }), set({ weightKg: 200, completedAt: null })]);
    expect(best).toEqual({ weightKg: 100, reps: 5 });
  });

  it("returns null when every set is planned", () => {
    expect(pickBestSet([set({ completedAt: null }), set({ completedAt: null })])).toBeNull();
  });

  it("returns null for an exercise with no sets", () => {
    expect(pickBestSet([])).toBeNull();
  });
});
