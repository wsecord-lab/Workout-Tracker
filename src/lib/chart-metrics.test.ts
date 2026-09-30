import { describe, it, expect } from "vitest";
import {
  chartTimeRangeToMetricsKey,
  isChartMetricsTimeRange,
} from "./chart-metrics";
import {
  findExerciseMetrics,
  formatVolumeKgReps,
  metricsRangeLabel,
  type ClientMetricsPayload,
} from "./metrics-shared";

describe("chartTimeRangeToMetricsKey", () => {
  it("maps 7d / 30d / 90d chart ranges onto metrics cache keys", () => {
    expect(chartTimeRangeToMetricsKey("week")).toBe("7d");
    expect(chartTimeRangeToMetricsKey("month")).toBe("30d");
    expect(chartTimeRangeToMetricsKey("3months")).toBe("90d");
  });

  it("returns null for ranges without a metrics cache entry", () => {
    expect(chartTimeRangeToMetricsKey("6months")).toBeNull();
    expect(chartTimeRangeToMetricsKey("year")).toBeNull();
    expect(chartTimeRangeToMetricsKey("all")).toBeNull();
  });
});

describe("isChartMetricsTimeRange", () => {
  it("is true only for week / month / 3months", () => {
    expect(isChartMetricsTimeRange("week")).toBe(true);
    expect(isChartMetricsTimeRange("month")).toBe(true);
    expect(isChartMetricsTimeRange("3months")).toBe(true);
    expect(isChartMetricsTimeRange("all")).toBe(false);
  });
});

describe("metrics callout helpers", () => {
  const payload: ClientMetricsPayload = {
    totalVolumeKgReps: 1000,
    computedAt: "2026-09-30T12:00:00.000Z",
    exercises: [
      {
        exerciseName: "Bench Press",
        bestE1RMKg: 110,
        bestWeightKg: 100,
        bestVolumeKgReps: 500,
        sessionDate: "2026-09-15",
      },
    ],
  };

  it("formats volume in lb·reps", () => {
    // 1000 kg·reps ≈ 2205 lb·reps
    expect(formatVolumeKgReps(1000)).toBe("2,205 lb·reps");
  });

  it("labels metrics ranges for the snapshot header", () => {
    expect(metricsRangeLabel("7d")).toBe("Past 7 days");
    expect(metricsRangeLabel("30d")).toBe("Past 30 days");
    expect(metricsRangeLabel("90d")).toBe("Past 90 days");
  });

  it("finds per-exercise PR rows from the metrics payload", () => {
    expect(findExerciseMetrics(payload, "Bench Press")?.bestWeightKg).toBe(100);
    expect(findExerciseMetrics(payload, "Squat")).toBeNull();
  });
});
