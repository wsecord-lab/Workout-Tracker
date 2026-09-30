const LB_PER_KG = 2.20462;

export type ClientMetricsPayload = {
  totalVolumeKgReps: number;
  exercises: Array<{
    exerciseName: string;
    bestE1RMKg: number;
    bestWeightKg: number;
    bestVolumeKgReps: number;
    sessionDate: string;
  }>;
  computedAt: string; // ISO
};

export type ExerciseMetrics = ClientMetricsPayload["exercises"][number];

export const METRICS_RANGE_KEYS = ["7d", "30d", "90d"] as const;
export type MetricsRangeKey = (typeof METRICS_RANGE_KEYS)[number];

const RANGE_DAYS: Record<MetricsRangeKey, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const RANGE_LABELS: Record<MetricsRangeKey, string> = {
  "7d": "Past 7 days",
  "30d": "Past 30 days",
  "90d": "Past 90 days",
};

export function isMetricsRangeKey(range: string): range is MetricsRangeKey {
  return (METRICS_RANGE_KEYS as readonly string[]).includes(range.toLowerCase());
}

export function parseRange(range: string | null): number | null {
  if (!range || typeof range !== "string") return null;
  const key = range.toLowerCase();
  if (!isMetricsRangeKey(key)) return null;
  return RANGE_DAYS[key];
}

export function metricsRangeLabel(range: MetricsRangeKey): string {
  return RANGE_LABELS[range];
}

/** Format kg·reps volume as imperial lb·reps for chart callouts. */
export function formatVolumeKgReps(kgReps: number): string {
  return `${Math.round(kgReps * LB_PER_KG).toLocaleString("en-US")} lb·reps`;
}

export function findExerciseMetrics(
  payload: ClientMetricsPayload,
  exerciseName: string
): ExerciseMetrics | null {
  return payload.exercises.find((e) => e.exerciseName === exerciseName) ?? null;
}
