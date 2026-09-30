import type { MetricsRangeKey } from "@/lib/metrics";

/** Chart UI time ranges that map onto the cached metrics API (7d / 30d / 90d). */
export type ChartMetricsTimeRange = "week" | "month" | "3months";

export type ChartTimeRange =
  | ChartMetricsTimeRange
  | "6months"
  | "year"
  | "all";

/** Map chart picker values to metrics cache keys. Longer ranges have no server payload. */
export function chartTimeRangeToMetricsKey(
  range: ChartTimeRange
): MetricsRangeKey | null {
  switch (range) {
    case "week":
      return "7d";
    case "month":
      return "30d";
    case "3months":
      return "90d";
    default:
      return null;
  }
}

export function isChartMetricsTimeRange(
  range: ChartTimeRange
): range is ChartMetricsTimeRange {
  return chartTimeRangeToMetricsKey(range) != null;
}
