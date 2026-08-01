import { describe, it, expect } from "vitest";
import { parseRange, aggregateMetrics, type MetricsSession } from "./metrics";

describe("parseRange", () => {
  it("returns 7 for 7d", () => {
    expect(parseRange("7d")).toBe(7);
    expect(parseRange("7D")).toBe(7);
  });
  it("returns 30 for 30d", () => {
    expect(parseRange("30d")).toBe(30);
  });
  it("returns 90 for 90d", () => {
    expect(parseRange("90d")).toBe(90);
  });
  it("returns null for invalid range", () => {
    expect(parseRange("")).toBeNull();
    expect(parseRange(null)).toBeNull();
    expect(parseRange("14d")).toBeNull();
    expect(parseRange("week")).toBeNull();
  });
});

describe("aggregateMetrics", () => {
  const date = new Date("2026-07-01T12:00:00Z");
  function session(sets: MetricsSession["exercises"][number]["sets"]): MetricsSession {
    return { date, exercises: [{ name: "Bench Press", sets }] };
  }

  it("sums volume over completed sets", () => {
    const result = aggregateMetrics([
      session([
        { weightKg: 100, reps: 5, completedAt: date },
        { weightKg: 100, reps: 3, completedAt: date },
      ]),
    ]);
    expect(result.totalVolumeKgReps).toBe(800);
    expect(result.exercises[0].bestWeightKg).toBe(100);
  });

  it("ignores planned sets — a target is not work performed", () => {
    const result = aggregateMetrics([
      session([
        { weightKg: 100, reps: 5, completedAt: date },
        // Planned but skipped. weightKg/reps hold the target, so counting it
        // would credit 1000 kg·reps of work that never happened.
        { weightKg: 200, reps: 5, completedAt: null },
      ]),
    ]);
    expect(result.totalVolumeKgReps).toBe(500);
    expect(result.exercises[0].bestWeightKg).toBe(100);
  });

  it("omits an exercise whose sets are all planned", () => {
    const result = aggregateMetrics([session([{ weightKg: 200, reps: 5, completedAt: null }])]);
    expect(result.totalVolumeKgReps).toBe(0);
    expect(result.exercises).toEqual([]);
  });
});
