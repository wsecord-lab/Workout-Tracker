"use client";

import { useState, useEffect, useId, useRef, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from "recharts";
import { formatWeight } from "@/lib/units";
import {
  type ClientMetricsPayload,
  type MetricsRangeKey,
  findExerciseMetrics,
  formatVolumeKgReps,
  metricsRangeLabel,
} from "@/lib/metrics-shared";
import {
  type ChartTimeRange,
  chartTimeRangeToMetricsKey,
} from "@/lib/chart-metrics";

const LB_PER_KG = 2.20462;

export type { ChartTimeRange };

/** Local date key YYYY-MM-DD (avoids UTC shifting). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** One item per day: keep the one with the latest timestamp for that day. Returns sorted by date ascending. */
function aggregateLatestPerDay<T>(items: T[], getDate: (item: T) => Date): T[] {
  const byDay = new Map<string, T>();
  for (const item of items) {
    const key = dayKey(getDate(item));
    const existing = byDay.get(key);
    if (!existing || getDate(item).getTime() > getDate(existing).getTime()) {
      byDay.set(key, item);
    }
  }
  return [...byDay.values()].sort((a, b) => getDate(a).getTime() - getDate(b).getTime());
}

/** One item per day: keep the item with the highest score for that day. Returns sorted by date ascending. */
function aggregateBestPerDay<T>(items: T[], getDate: (item: T) => Date, scoreFn: (item: T) => number): T[] {
  const byDay = new Map<string, T>();
  for (const item of items) {
    const key = dayKey(getDate(item));
    const existing = byDay.get(key);
    if (!existing || scoreFn(item) > scoreFn(existing)) {
      byDay.set(key, item);
    }
  }
  return [...byDay.values()].sort((a, b) => getDate(a).getTime() - getDate(b).getTime());
}

/** Y-axis: domain and ticks in kg with padding; displayed labels are multiples of 5 lb */
function weightAxisProps(weightKgs: number[]) {
  if (weightKgs.length === 0) return { domain: [0, 100] as [number, number], ticks: [0, 50, 100] };
  const minKg = Math.min(...weightKgs);
  const maxKg = Math.max(...weightKgs);
  const minLb = minKg * LB_PER_KG;
  const maxLb = maxKg * LB_PER_KG;
  const rangeLb = maxLb - minLb;
  const padLb = Math.max(2.5, rangeLb * 0.08);
  const paddedMinLb = minLb - padLb;
  const paddedMaxLb = maxLb + padLb;
  const tickMinLb = Math.floor(paddedMinLb / 5) * 5;
  const tickMaxLb = Math.ceil(paddedMaxLb / 5) * 5;
  const tickLbs: number[] = [];
  for (let lb = tickMinLb; lb <= tickMaxLb; lb += 5) tickLbs.push(lb);
  const tickKgs = tickLbs.map((lb) => lb / LB_PER_KG);
  const domain: [number, number] = [tickKgs[0], tickKgs[tickKgs.length - 1]];
  return { domain, ticks: tickKgs };
}

/** Y-axis when values are already in display units (e.g. lb or volume). step used for tick spacing. */
function numericAxisProps(values: number[], step: number = 5) {
  if (values.length === 0) return { domain: [0, 100] as [number, number], ticks: [0, 50, 100] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = Math.max(step * 0.5, range * 0.08);
  const paddedMin = min - pad;
  const paddedMax = max + pad;
  const tickMin = Math.floor(paddedMin / step) * step;
  const tickMax = Math.ceil(paddedMax / step) * step;
  const ticks: number[] = [];
  for (let v = tickMin; v <= tickMax; v += step) ticks.push(v);
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  return { domain, ticks };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** X-axis: tick timestamps adapted to the selected time range */
function xAxisTicksForRange(minTs: number, maxTs: number, range: ChartTimeRange): number[] {
  const out: number[] = [];
  const min = new Date(minTs);
  const max = new Date(maxTs);

  if (range === "week") {
    // Past 7 days: one tick per day
    const start = new Date(min);
    start.setHours(0, 0, 0, 0);
    for (let t = start.getTime(); t <= max.getTime(); t += DAY_MS) out.push(t);
    return out;
  }

  if (range === "month") {
    // Beginning of every week (Sunday)
    const d = new Date(min);
    d.setHours(0, 0, 0, 0);
    const dayOfWeek = d.getDay();
    d.setDate(d.getDate() - dayOfWeek);
    while (d.getTime() <= max.getTime()) {
      if (d.getTime() >= minTs - DAY_MS) out.push(d.getTime());
      d.setDate(d.getDate() + 7);
    }
    return out;
  }

  if (range === "3months") {
    // Beginning of every 2 weeks
    const d = new Date(min);
    d.setHours(0, 0, 0, 0);
    const dayOfWeek = d.getDay();
    d.setDate(d.getDate() - dayOfWeek);
    while (d.getTime() <= max.getTime()) {
      if (d.getTime() >= minTs - DAY_MS) out.push(d.getTime());
      d.setDate(d.getDate() + 14);
    }
    return out;
  }

  // 6 months, year, all: first of each month
  const d = new Date(min.getFullYear(), min.getMonth(), 1);
  const end = new Date(max.getFullYear(), max.getMonth(), 1);
  while (d.getTime() <= end.getTime()) {
    out.push(d.getTime());
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

/** X-axis tick label: short ranges "Mar 1", long ranges "Mar '26" */
function formatXAxisTick(ts: number, range: ChartTimeRange): string {
  const d = new Date(ts);
  const shortRanges = range === "week" || range === "month";
  if (shortRanges) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

type ChartPoint = { date: string; dateNum: number; weightKg: number; weightLb: string; trendKg?: number; reps?: number };

export type ExerciseMetric = "weight" | "e1rm" | "volume";

export type ExerciseChartPoint = {
  date: string;
  dateNum: number;
  weightKg: number;
  reps: number;
  weightLb: string;
  bestWeightLb: number;
  e1rmLb: number;
  volumeLbReps: number;
};

function epley1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

function exerciseMetricValue(p: ExerciseChartPoint, metric: ExerciseMetric): number {
  switch (metric) {
    case "weight":
      return p.bestWeightLb;
    case "e1rm":
      return p.e1rmLb;
    case "volume":
      return p.volumeLbReps;
  }
}

const TIME_RANGE_OPTIONS: { value: ChartTimeRange; label: string }[] = [
  { value: "week", label: "Past 7 days" },
  { value: "month", label: "Past 30 days" },
  { value: "3months", label: "Past 90 days" },
  { value: "6months", label: "Past 6 months" },
  { value: "year", label: "Past 1 year" },
  { value: "all", label: "All time" },
];

const EXERCISE_CHART_FAVORITES_KEY = "workout-tracker-exercise-chart-favorites";
const MAX_FAVORITES = 5;

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function cutoffForRange(range: ChartTimeRange): number {
  if (range === "all") return 0;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  switch (range) {
    case "week":
      return now - 7 * day;
    case "month":
      return now - 30 * day;
    case "3months":
      return now - 90 * day;
    case "6months":
      return now - 180 * day;
    case "year":
      return now - 365 * day;
    default:
      return 0;
  }
}

function filterPointsByRange<T extends { dateNum: number }>(points: T[], range: ChartTimeRange): T[] {
  if (range === "all") return points;
  const cutoff = cutoffForRange(range);
  return points.filter((p) => p.dateNum >= cutoff);
}

function aggregateExerciseByDay(points: ExerciseChartPoint[], metric: ExerciseMetric): ExerciseChartPoint[] {
  return aggregateBestPerDay(points, (p) => new Date(p.dateNum), (p) => exerciseMetricValue(p, metric));
}

const SEVEN_DAY_MS = 7 * DAY_MS;

/** Compute 7-day trailing moving average of weightKg; mutates points in place. */
function add7DayTrend(points: ChartPoint[]): void {
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const windowEnd = point.dateNum;
    const windowStart = windowEnd - SEVEN_DAY_MS;
    let sum = 0;
    let count = 0;
    for (let j = 0; j <= i; j++) {
      if (points[j].dateNum >= windowStart && points[j].dateNum <= windowEnd) {
        sum += points[j].weightKg;
        count++;
      }
    }
    point.trendKg = count > 0 ? sum / count : point.weightKg;
  }
}

type BodyWeightTooltipPayload = { payload: ChartPoint; name?: string; value?: number; dataKey?: string };

function BodyWeightTooltip({
  active,
  payload,
  showTrend,
  isPinned,
  onClear,
}: {
  active?: boolean;
  payload?: readonly BodyWeightTooltipPayload[];
  showTrend: boolean;
  isPinned?: boolean;
  onClear?: () => void;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as ChartPoint;
  const weightEntry = payload.find((p) => p.dataKey === "weightKg");
  const trendEntry = payload.find((p) => p.dataKey === "trendKg");
  const dateStr = formatFullDate(point.dateNum);
  return (
    <div
      className="rounded border border-border bg-surface px-3 py-2 text-sm shadow-lg"
      style={{ border: "1px solid var(--border)", backgroundColor: "var(--surface)" }}
    >
      <div className="font-medium text-[var(--text)]">{dateStr}</div>
      <div className="mt-0.5 text-[var(--text)]">
        {weightEntry?.value != null ? formatWeight(weightEntry.value) : "—"}
      </div>
      {showTrend && trendEntry?.value != null && (
        <div className="text-muted text-xs mt-0.5">Trend (7-day avg): {formatWeight(trendEntry.value)}</div>
      )}
      {isPinned && onClear && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="mt-2 text-xs text-primary hover:text-primary-hover underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function ChartDot({
  cx,
  cy,
  index,
  r,
  fill,
  isPinned,
  onPin,
  stroke,
  strokeWidth,
}: {
  cx?: number;
  cy?: number;
  index?: number;
  r?: number | string;
  fill?: string;
  isPinned?: boolean;
  onPin?: (index: number) => void;
  stroke?: string;
  strokeWidth?: number | string;
}) {
  const rNum = typeof r === "number" ? r : typeof r === "string" ? Number(r) : 4;
  const radius = isPinned ? 8 : rNum;
  const showStroke = isPinned || stroke;
  const strokeWidthNum = typeof strokeWidth === "number" ? strokeWidth : typeof strokeWidth === "string" ? Number(strokeWidth) : 2;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={radius}
      fill={fill}
      stroke={showStroke ? (stroke ?? "var(--surface)") : undefined}
      strokeWidth={showStroke ? strokeWidthNum : undefined}
      style={{ cursor: "pointer" }}
      onClick={(e) => { e.stopPropagation(); onPin?.(index ?? 0); }}
      onTouchEnd={(e) => { e.preventDefault(); onPin?.(index ?? 0); }}
    />
  );
}

/** Hook: true when viewport is md or larger (768px). */
function useIsMd() {
  const [isMd, setIsMd] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsMd(mq.matches);
    const listener = () => setIsMd(mq.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return isMd;
}

type BrushRange = { startIndex: number; endIndex: number };

/** Draft brush updates on every drag; committed only on pointerup/touchend so chart and KPIs stay stable. */
function useBrushWithCommit(n: number, resetDeps: React.DependencyList) {
  const [draftBrush, setDraftBrush] = useState<BrushRange | null>(null);
  const [committedBrush, setCommittedBrush] = useState<BrushRange | null>(null);
  const draftRef = useRef<BrushRange | null>(null);
  draftRef.current = draftBrush;

  useEffect(() => {
    setDraftBrush(null);
    setCommittedBrush(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  useEffect(() => {
    const commit = () => {
      if (draftRef.current != null) {
        setCommittedBrush(draftRef.current);
      }
    };
    window.addEventListener("pointerup", commit);
    window.addEventListener("touchend", commit);
    return () => {
      window.removeEventListener("pointerup", commit);
      window.removeEventListener("touchend", commit);
    };
  }, []);

  const fullRange = n > 0 ? { startIndex: 0, endIndex: n - 1 } : null;
  const committedRange = committedBrush ?? fullRange;
  const draftRange = draftBrush ?? fullRange;

  return { draftRange, committedRange, setDraftBrush, fullRange };
}

/** Brush height: larger on mobile for easier touch. */
const BRUSH_HEIGHT_DESKTOP = 36;
const BRUSH_HEIGHT_MOBILE = 48;

/** Fetch cached metrics for 7d/30d/90d chart ranges. */
function useClientMetrics(clientId: string | undefined, timeRange: ChartTimeRange) {
  const metricsKey = chartTimeRangeToMetricsKey(timeRange);
  const [metrics, setMetrics] = useState<ClientMetricsPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId || !metricsKey) {
      setMetrics(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/clients/${encodeURIComponent(clientId)}/metrics?range=${metricsKey}`)
      .then((res) => {
        if (!res.ok) throw new Error(`metrics ${res.status}`);
        return res.json() as Promise<ClientMetricsPayload>;
      })
      .then((payload) => {
        if (!cancelled) setMetrics(payload);
      })
      .catch(() => {
        if (!cancelled) setMetrics(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, metricsKey]);

  return { metrics, loading, metricsKey };
}

function MetricsProgressCallouts({
  metrics,
  metricsKey,
  loading,
  exerciseName,
}: {
  metrics: ClientMetricsPayload | null;
  metricsKey: MetricsRangeKey | null;
  loading: boolean;
  exerciseName: string;
}) {
  if (!metricsKey) return null;

  const exercise = metrics ? findExerciseMetrics(metrics, exerciseName) : null;
  const label = metricsRangeLabel(metricsKey);

  return (
    <div
      className="mb-4 rounded-lg border border-border bg-surface/50 px-3 py-3"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          Progress snapshot · {label}
        </div>
        {loading && <span className="text-xs text-muted">Updating…</span>}
      </div>
      {metrics ? (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted">Total volume</div>
            <div className="text-base font-semibold text-[var(--text)]">
              {formatVolumeKgReps(metrics.totalVolumeKgReps)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">PR weight</div>
            <div className="text-base font-semibold text-[var(--text)]">
              {exercise ? formatWeight(exercise.bestWeightKg) : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">PR e1RM</div>
            <div className="text-base font-semibold text-[var(--text)]">
              {exercise ? formatWeight(exercise.bestE1RMKg) : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Volume PR</div>
            <div className="text-base font-semibold text-[var(--text)]">
              {exercise ? formatVolumeKgReps(exercise.bestVolumeKgReps) : "—"}
            </div>
          </div>
        </div>
      ) : !loading ? (
        <p className="mt-2 text-sm text-muted">No completed sets in this range yet.</p>
      ) : null}
    </div>
  );
}

export function BodyWeightChart({
  records,
  currentWeightKg,
}: {
  records: { weightKg: number; recordedAt: Date }[];
  currentWeightKg: number;
}) {
  const [timeRange, setTimeRange] = useState<ChartTimeRange>("month");
  const [showTrend, setShowTrend] = useState(false);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const isMd = useIsMd();

  const filteredPoints = useMemo(() => {
    let points: ChartPoint[] = [...records]
      .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
      .map((r) => {
        const d = new Date(r.recordedAt);
        return {
          date: d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "2-digit",
          }),
          dateNum: d.getTime(),
          weightKg: r.weightKg,
          weightLb: formatWeight(r.weightKg),
        };
      });
    if (points.length === 0 && currentWeightKg > 0) {
      const d = new Date();
      points = [{
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }),
        dateNum: d.getTime(),
        weightKg: currentWeightKg,
        weightLb: formatWeight(currentWeightKg),
      }];
    }
    if (points.length === 0) return [];
    points = aggregateLatestPerDay(points, (p) => new Date(p.dateNum));
    add7DayTrend(points);
    return filterPointsByRange(points, timeRange);
  }, [records, timeRange, currentWeightKg]);

  const n = filteredPoints.length;
  const { draftRange, committedRange, setDraftBrush } = useBrushWithCommit(n, [timeRange]);

  useEffect(() => {
    setPinnedIndex(null);
  }, [timeRange]);

  const visiblePoints = useMemo(
    () => (committedRange ? filteredPoints.slice(committedRange.startIndex, committedRange.endIndex + 1) : filteredPoints),
    [filteredPoints, committedRange]
  );

  if (filteredPoints.length === 0) return null;

  const kpiCurrent = visiblePoints.length > 0 ? visiblePoints[visiblePoints.length - 1].weightKg : null;
  const kpiFirst = visiblePoints.length > 0 ? visiblePoints[0].weightKg : null;
  const kpiChange =
    kpiCurrent != null && kpiFirst != null ? kpiCurrent - kpiFirst : null;
  const firstTs = visiblePoints.length > 0 ? visiblePoints[0].dateNum : 0;
  const lastTs = visiblePoints.length > 0 ? visiblePoints[visiblePoints.length - 1].dateNum : 0;
  const weeksInRange = lastTs > firstTs ? (lastTs - firstTs) / (7 * DAY_MS) : 0;
  const kpiRatePerWeek =
    kpiChange != null && weeksInRange > 0 ? kpiChange / weeksInRange : null;
  const kpiAverage =
    visiblePoints.length > 0
      ? visiblePoints.reduce((sum, p) => sum + p.weightKg, 0) / visiblePoints.length
      : null;

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-[var(--text)]">Body weight over time</h3>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={showTrend}
              onChange={(e) => setShowTrend(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            Show trend (7-day avg)
          </label>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as ChartTimeRange)}
            className="input w-auto min-w-[140px] py-1.5 text-sm"
            aria-label="Time range"
          >
            {TIME_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {filteredPoints.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded border border-border bg-surface/50 px-3 py-2 text-sm md:grid-cols-4">
          <div>
            <span className="text-muted">Current</span>
            <p className="font-medium text-[var(--text)]">
              {kpiCurrent != null ? formatWeight(kpiCurrent) : "—"}
            </p>
          </div>
          <div>
            <span className="text-muted">Change</span>
            <p className="font-medium text-[var(--text)]">
              {kpiChange != null
                ? `${kpiChange >= 0 ? "+" : ""}${formatWeight(kpiChange)}`
                : "—"}
            </p>
          </div>
          <div>
            <span className="text-muted">Rate</span>
            <p className="font-medium text-[var(--text)]">
              {kpiRatePerWeek != null
                ? `${kpiRatePerWeek >= 0 ? "+" : ""}${formatWeight(kpiRatePerWeek)}/week`
                : "—"}
            </p>
          </div>
          <div>
            <span className="text-muted">Average</span>
            <p className="font-medium text-[var(--text)]">
              {kpiAverage != null ? formatWeight(kpiAverage) : "—"}
            </p>
          </div>
        </div>
      )}
      <div className="h-64">
        {filteredPoints.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted text-sm">
            No data in this time range
          </div>
        ) : (
          (() => {
            const weightKgs = filteredPoints.map((p) => p.weightKg);
            const { domain: yDomain, ticks: yTicks } = weightAxisProps(weightKgs);
            const minTs = Math.min(...filteredPoints.map((p) => p.dateNum));
            const maxTs = Math.max(...filteredPoints.map((p) => p.dateNum));
            const xTicks = xAxisTicksForRange(minTs, maxTs, timeRange);
            return (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="dateNum"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    ticks={xTicks}
                    tickFormatter={(ts) => formatXAxisTick(ts, timeRange)}
                    stroke="var(--muted-text)"
                    fontSize={12}
                  />
                  <YAxis
                    domain={yDomain}
                    ticks={yTicks}
                    stroke="var(--muted-text)"
                    fontSize={12}
                    tickFormatter={(v) => `${Math.round(v * LB_PER_KG)} lb`}
                  />
                  <Tooltip
                    content={(props) => (
                      <BodyWeightTooltip
                        active={props.active}
                        payload={props.payload as readonly BodyWeightTooltipPayload[] | undefined}
                        showTrend={showTrend}
                        isPinned={pinnedIndex !== null}
                        onClear={() => setPinnedIndex(null)}
                      />
                    )}
                    cursor={{ stroke: "var(--border)", strokeWidth: 1, strokeDasharray: "3 3" }}
                    active={pinnedIndex === null ? undefined : false}
                  />
                  {pinnedIndex !== null && filteredPoints[pinnedIndex] && (
                    <ReferenceLine
                      x={filteredPoints[pinnedIndex].dateNum}
                      stroke="var(--primary)"
                      strokeWidth={1}
                      strokeOpacity={0.7}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="weightKg"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={(props) => (
                      <ChartDot
                        {...props}
                        fill="var(--chart-1)"
                        isPinned={pinnedIndex === props.index}
                        onPin={setPinnedIndex}
                      />
                    )}
                    activeDot={(props) => (
                      <ChartDot
                        {...props}
                        r={8}
                        fill="var(--chart-1)"
                        stroke="var(--surface)"
                        strokeWidth={2}
                        isPinned={pinnedIndex === props.index}
                        onPin={setPinnedIndex}
                      />
                    )}
                  />
                  {showTrend && (
                    <Line
                      type="monotone"
                      dataKey="trendKg"
                      stroke="var(--chart-2)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={false}
                    />
                  )}
                  {filteredPoints.length > 1 && (
                    <Brush
                      dataKey="dateNum"
                      startIndex={draftRange?.startIndex ?? 0}
                      endIndex={draftRange?.endIndex ?? Math.max(0, n - 1)}
                      onChange={(e) => {
                        if (e?.startIndex != null && e?.endIndex != null) {
                          setDraftBrush({ startIndex: e.startIndex, endIndex: e.endIndex });
                        }
                      }}
                      height={isMd ? BRUSH_HEIGHT_DESKTOP : BRUSH_HEIGHT_MOBILE}
                      stroke="var(--border)"
                      fill="var(--surface)"
                      travellerWidth={8}
                      tickFormatter={() => ""}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            );
          })()
        )}
      </div>
      {pinnedIndex !== null && filteredPoints[pinnedIndex] != null && (
        <div className="mt-2 rounded border border-border bg-surface px-3 py-2 text-sm shadow-sm">
          <BodyWeightTooltip
            active
            payload={[
              {
                payload: filteredPoints[pinnedIndex!],
                value: filteredPoints[pinnedIndex!].weightKg,
                dataKey: "weightKg",
              },
              ...(showTrend && filteredPoints[pinnedIndex!].trendKg != null
                ? [{ payload: filteredPoints[pinnedIndex!], value: filteredPoints[pinnedIndex!].trendKg, dataKey: "trendKg" as const }]
                : []),
            ]}
            showTrend={showTrend}
            isPinned
            onClear={() => setPinnedIndex(null)}
          />
        </div>
      )}
    </div>
  );
}

type ProgressRow = { sessionId: string; sessionDate: Date; bestSet: { weightKg: number; reps: number } };
type ProgressByExercise = { exerciseName: string; rows: ProgressRow[] };

function buildExerciseChartData(exercise: ProgressByExercise): ExerciseChartPoint[] {
  return [...exercise.rows]
    .sort((a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime())
    .map((r) => {
      const d = new Date(r.sessionDate);
      const weightKg = r.bestSet.weightKg;
      const reps = r.bestSet.reps;
      const bestWeightLb = weightKg * LB_PER_KG;
      const e1rmKg = epley1RM(weightKg, reps);
      const e1rmLb = e1rmKg * LB_PER_KG;
      const volumeLbReps = bestWeightLb * reps;
      return {
        date: d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "2-digit",
        }),
        dateNum: d.getTime(),
        weightKg,
        reps,
        weightLb: formatWeight(weightKg),
        bestWeightLb,
        e1rmLb,
        volumeLbReps,
      };
    });
}

function formatFullDate(dateNum: number): string {
  return new Date(dateNum).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type TooltipPayloadItem = { payload: ChartPoint | ExerciseChartPoint; value?: number; name?: string };

function formatExerciseMetricValue(p: ExerciseChartPoint, metric: ExerciseMetric): string {
  switch (metric) {
    case "weight":
      return `${p.bestWeightLb.toFixed(1)} lb`;
    case "e1rm":
      return `${p.e1rmLb.toFixed(1)} lb`;
    case "volume":
      return `${Math.round(p.volumeLbReps)} lb·reps`;
  }
}

function exerciseMetricLabel(metric: ExerciseMetric): string {
  switch (metric) {
    case "weight":
      return "Best weight";
    case "e1rm":
      return "e1RM";
    case "volume":
      return "Volume";
  }
}

function WeightChartTooltipContent({
  active,
  payload,
  showReps,
  isPinned,
  onClear,
  selectedMetric,
}: {
  active?: boolean;
  payload?: readonly TooltipPayloadItem[];
  showReps?: boolean;
  isPinned?: boolean;
  onClear?: () => void;
  selectedMetric?: ExerciseMetric;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const dateStr = formatFullDate(p.dateNum);
  const valueLine = showReps && "reps" in p && p.reps != null
    ? `Best Set: ${p.weightLb} × ${p.reps}`
    : p.weightLb;
  const isExercisePoint = "bestWeightLb" in p && "e1rmLb" in p && "volumeLbReps" in p;

  return (
    <div
      className="rounded border border-border bg-surface px-3 py-2 text-sm shadow-lg"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <div className="font-medium text-[var(--text)]">{dateStr}</div>
      <div className="text-muted mt-0.5">{valueLine}</div>
      {selectedMetric != null && isExercisePoint && (
        <div className="text-muted mt-0.5">
          {exerciseMetricLabel(selectedMetric)}: {formatExerciseMetricValue(p as ExerciseChartPoint, selectedMetric)}
        </div>
      )}
      {isPinned && onClear && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="mt-2 text-xs text-primary hover:text-primary-hover underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function loadFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EXERCISE_CHART_FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]).slice(0, MAX_FAVORITES) : [];
  } catch {
    return [];
  }
}

function saveFavorites(favorites: string[]) {
  try {
    localStorage.setItem(EXERCISE_CHART_FAVORITES_KEY, JSON.stringify(favorites.slice(0, MAX_FAVORITES)));
  } catch {
    /* ignore */
  }
}

const EXERCISE_METRIC_OPTIONS: { value: ExerciseMetric; label: string }[] = [
  { value: "weight", label: "Best Weight" },
  { value: "e1rm", label: "Estimated 1RM" },
  { value: "volume", label: "Volume" },
];

function exerciseChartDataKey(metric: ExerciseMetric): "bestWeightLb" | "e1rmLb" | "volumeLbReps" {
  switch (metric) {
    case "weight":
      return "bestWeightLb";
    case "e1rm":
      return "e1rmLb";
    case "volume":
      return "volumeLbReps";
  }
}

export function ExerciseWeightChart({
  progress,
  clientId,
}: {
  progress: ProgressByExercise[];
  /** When set, 7d/30d/90d ranges load PR/volume callouts from the metrics cache API. */
  clientId?: string;
}) {
  const listId = useId();
  const isMd = useIsMd();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedMetric, setSelectedMetric] = useState<ExerciseMetric>("weight");
  const [timeRange, setTimeRange] = useState<ChartTimeRange>(clientId ? "month" : "all");
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");

  const { metrics, loading: metricsLoading, metricsKey } = useClientMetrics(clientId, timeRange);

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  useEffect(() => {
    setInputValue(progress[selectedIndex]?.exerciseName ?? "");
  }, [selectedIndex, progress]);

  useEffect(() => {
    setPinnedIndex(null);
  }, [selectedIndex, timeRange, selectedMetric]);

  const selected = progress[selectedIndex];
  const rawChartData = useMemo(
    () => (selected ? buildExerciseChartData(selected) : []),
    [selected]
  );
  const chartData = useMemo(
    () => (selected ? aggregateExerciseByDay(rawChartData, selectedMetric) : []),
    [rawChartData, selectedMetric, selected]
  );
  const filteredChartData = useMemo(
    () => filterPointsByRange(chartData, timeRange),
    [chartData, timeRange]
  );
  const dataLen = filteredChartData.length;
  const { draftRange, committedRange, setDraftBrush } = useBrushWithCommit(dataLen, [
    selectedIndex,
    timeRange,
    selectedMetric,
    progress,
  ]);

  const visibleData = useMemo(() => {
    if (dataLen === 0 || !committedRange) return [];
    const start = Math.max(0, Math.min(committedRange.startIndex, dataLen - 1));
    const end = Math.min(dataLen - 1, Math.max(committedRange.endIndex, start));
    return filteredChartData.slice(start, end + 1);
  }, [filteredChartData, committedRange, dataLen]);

  if (progress.length === 0) return null;
  const selectedName = selected.exerciseName;
  const isFavorited = favorites.includes(selectedName);
  const exerciseNames = progress.map((p) => p.exerciseName);
  const favoritesInProgress = favorites.filter((name) => exerciseNames.includes(name));
  const exerciseMetrics = metrics ? findExerciseMetrics(metrics, selectedName) : null;

  function toggleFavorite() {
    const next = isFavorited
      ? favorites.filter((n) => n !== selectedName)
      : favorites.includes(selectedName)
        ? favorites
        : favorites.length >= MAX_FAVORITES
          ? [...favorites.slice(0, -1), selectedName]
          : [...favorites, selectedName];
    setFavorites(next);
    saveFavorites(next);
  }

  function selectExerciseByName(name: string) {
    const idx = progress.findIndex((p) => p.exerciseName === name);
    if (idx >= 0) setSelectedIndex(idx);
  }

  const seriesBestLb =
    visibleData.length > 0
      ? Math.max(...visibleData.map((p) => exerciseMetricValue(p, selectedMetric)))
      : null;
  const seriesVolumePr =
    visibleData.length > 0 ? Math.max(...visibleData.map((p) => p.volumeLbReps)) : null;

  const bestDisplay =
    exerciseMetrics != null
      ? selectedMetric === "volume"
        ? formatVolumeKgReps(exerciseMetrics.bestVolumeKgReps)
        : selectedMetric === "e1rm"
          ? formatWeight(exerciseMetrics.bestE1RMKg)
          : formatWeight(exerciseMetrics.bestWeightKg)
      : seriesBestLb != null
        ? selectedMetric === "volume"
          ? `${Math.round(seriesBestLb)} lb·reps`
          : `${seriesBestLb.toFixed(1)} lb`
        : "—";

  const volumePrDisplay =
    exerciseMetrics != null
      ? formatVolumeKgReps(exerciseMetrics.bestVolumeKgReps)
      : seriesVolumePr != null
        ? `${Math.round(seriesVolumePr)} lb·reps`
        : "—";

  return (
    <div className="card">
      <h3 className="mb-2 font-semibold text-[var(--text)]">Exercise weight over time</h3>
      <p className="mb-3 text-sm text-muted">
        Best set per session (one point per day)
        {clientId ? " · PRs and volume for 7 / 30 / 90 days come from cached metrics" : ""}
      </p>
      <div className="mb-4 space-y-3 border-b border-border pb-3">
        {favoritesInProgress.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Favorites:</span>
            {favoritesInProgress.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => selectExerciseByName(name)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium outline-none transition-colors focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                  selectedName === name
                    ? "bg-primary text-white"
                    : "bg-background text-muted hover:bg-border hover:text-[var(--text)]"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 min-w-0 items-center gap-2">
            <input
              list={listId}
              value={inputValue}
              onChange={(e) => {
                const value = e.target.value;
                setInputValue(value);
                selectExerciseByName(value);
              }}
              onBlur={() => setInputValue(progress[selectedIndex]?.exerciseName ?? "")}
              placeholder="Search exercise…"
              className="input max-w-xs flex-1 min-w-0 py-1.5 text-sm"
              aria-label="Select exercise"
            />
            <datalist id={listId}>
              {progress.map((ex) => (
                <option key={ex.exerciseName} value={ex.exerciseName} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={toggleFavorite}
              className="shrink-0 rounded p-1.5 text-muted hover:bg-border hover:text-[var(--text)] outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              title={isFavorited ? "Remove from favorites" : "Add to favorites"}
              aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
            >
              <StarIcon filled={isFavorited} />
            </button>
          </div>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as ExerciseMetric)}
            className="input w-auto min-w-[140px] py-1.5 text-sm"
            aria-label="Metric"
          >
            {EXERCISE_METRIC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as ChartTimeRange)}
            className="input w-auto min-w-[140px] py-1.5 text-sm"
            aria-label="Time range"
          >
            {TIME_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {clientId && (
        <MetricsProgressCallouts
          metrics={metrics}
          metricsKey={metricsKey}
          loading={metricsLoading}
          exerciseName={selectedName}
        />
      )}
      {filteredChartData.length > 0 && visibleData.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface/50 px-3 py-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">Current</div>
            <div className="text-lg font-semibold text-[var(--text)]">
              {visibleData[visibleData.length - 1].weightLb} × {visibleData[visibleData.length - 1].reps}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface/50 px-3 py-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">Progress</div>
            <div className={`text-lg font-semibold ${visibleData.length > 1 ? (exerciseMetricValue(visibleData[visibleData.length - 1], selectedMetric) >= exerciseMetricValue(visibleData[0], selectedMetric) ? "text-emerald-600" : "text-rose-600") : "text-[var(--text)]"}`}>
              {visibleData.length > 1
                ? (() => {
                    const latest = exerciseMetricValue(visibleData[visibleData.length - 1], selectedMetric);
                    const first = exerciseMetricValue(visibleData[0], selectedMetric);
                    const diff = latest - first;
                    const sign = diff >= 0 ? "+" : "";
                    if (selectedMetric === "volume") return `${sign}${Math.round(diff)} lb·reps`;
                    return `${sign}${diff.toFixed(1)} lb`;
                  })()
                : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface/50 px-3 py-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">
              Best{exerciseMetrics ? " (range)" : ""}
            </div>
            <div className="text-lg font-semibold text-[var(--text)]">{bestDisplay}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface/50 px-3 py-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">
              Volume PR{exerciseMetrics ? " (range)" : ""}
            </div>
            <div className="text-lg font-semibold text-[var(--text)]">{volumePrDisplay}</div>
          </div>
        </div>
      )}
      <div className="h-64">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted">
            No session data for {selected.exerciseName} yet
          </div>
        ) : filteredChartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted text-sm">
            No data in this time range
          </div>
        ) : (
          (() => {
            const dataKey = exerciseChartDataKey(selectedMetric);
            const metricValues = visibleData.map((p) => exerciseMetricValue(p, selectedMetric));
            const step = selectedMetric === "volume" ? 100 : 5;
            const { domain: yDomain, ticks: yTicks } = numericAxisProps(metricValues, step);
            const minTs = visibleData.length > 0 ? Math.min(...visibleData.map((p) => p.dateNum)) : 0;
            const maxTs = visibleData.length > 0 ? Math.max(...visibleData.map((p) => p.dateNum)) : 0;
            const xTicks = xAxisTicksForRange(minTs, maxTs, timeRange);
            const xDomain = visibleData.length > 0 ? [visibleData[0].dateNum, visibleData[visibleData.length - 1].dateNum] as [number, number] : undefined;
            const yTickFormatter = selectedMetric === "volume"
              ? (v: number) => `${Math.round(v)} lb·reps`
              : (v: number) => `${Math.round(v)} lb`;
            return (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="dateNum"
                    type="number"
                    domain={xDomain ?? ["dataMin", "dataMax"]}
                    ticks={xTicks}
                    tickFormatter={(ts) => formatXAxisTick(ts, timeRange)}
                    stroke="var(--muted-text)"
                    fontSize={12}
                  />
                  <YAxis
                    domain={yDomain}
                    ticks={yTicks}
                    stroke="var(--muted-text)"
                    fontSize={12}
                    tickFormatter={yTickFormatter}
                  />
                  <Tooltip
                    content={(props) => (
                      <WeightChartTooltipContent
                        active={props.active}
                        payload={props.payload as readonly TooltipPayloadItem[] | undefined}
                        showReps
                        selectedMetric={selectedMetric}
                        isPinned={pinnedIndex !== null}
                        onClear={() => setPinnedIndex(null)}
                      />
                    )}
                    cursor={{ stroke: "var(--border)", strokeWidth: 1, strokeDasharray: "3 3" }}
                    active={pinnedIndex === null ? undefined : false}
                  />
                  {pinnedIndex !== null && filteredChartData[pinnedIndex] && (
                    <ReferenceLine
                      x={filteredChartData[pinnedIndex].dateNum}
                      stroke="var(--primary)"
                      strokeWidth={1}
                      strokeOpacity={0.7}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey={dataKey}
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={(props) => (
                      <ChartDot
                        {...props}
                        fill="var(--chart-1)"
                        isPinned={pinnedIndex === props.index}
                        onPin={setPinnedIndex}
                      />
                    )}
                    activeDot={(props) => (
                      <ChartDot
                        {...props}
                        r={8}
                        fill="var(--chart-1)"
                        stroke="var(--surface)"
                        strokeWidth={2}
                        isPinned={pinnedIndex === props.index}
                        onPin={setPinnedIndex}
                      />
                    )}
                  />
                  <Brush
                    dataKey="dateNum"
                    height={isMd ? 24 : BRUSH_HEIGHT_MOBILE}
                    stroke="var(--border)"
                    fill="var(--surface)"
                    travellerWidth={8}
                    startIndex={draftRange?.startIndex ?? 0}
                    endIndex={draftRange?.endIndex ?? Math.max(0, dataLen - 1)}
                    onChange={(next) => {
                      if (next.startIndex != null && next.endIndex != null) {
                        setDraftBrush({ startIndex: next.startIndex, endIndex: next.endIndex });
                      }
                    }}
                    tickFormatter={() => ""}
                  />
                </LineChart>
              </ResponsiveContainer>
            );
          })()
        )}
      </div>
      {pinnedIndex !== null && filteredChartData[pinnedIndex] != null && (
        <div className="mt-2 rounded border border-border bg-surface px-3 py-2 text-sm shadow-sm">
          <WeightChartTooltipContent
            active
            payload={[{ payload: filteredChartData[pinnedIndex!], value: exerciseMetricValue(filteredChartData[pinnedIndex!], selectedMetric) }]}
            showReps
            selectedMetric={selectedMetric}
            isPinned
            onClear={() => setPinnedIndex(null)}
          />
        </div>
      )}
    </div>
  );
}
