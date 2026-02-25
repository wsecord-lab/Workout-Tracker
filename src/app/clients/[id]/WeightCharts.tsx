"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatWeight } from "@/lib/units";

type BodyWeightPoint = { date: string; weightKg: number; weightLb: string };

export function BodyWeightChart({
  records,
  currentWeightKg,
}: {
  records: { weightKg: number; recordedAt: Date }[];
  currentWeightKg: number;
}) {
  const points: BodyWeightPoint[] = [...records]
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
    .map((r) => ({
      date: new Date(r.recordedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "2-digit",
      }),
      weightKg: r.weightKg,
      weightLb: formatWeight(r.weightKg),
    }));

  if (points.length === 0 && currentWeightKg > 0) {
    points.push({
      date: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "2-digit",
      }),
      weightKg: currentWeightKg,
      weightLb: formatWeight(currentWeightKg),
    });
  }

  if (points.length === 0) return null;

  return (
    <div className="card">
      <h3 className="mb-4 font-semibold text-[var(--text)]">Body weight over time</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" stroke="var(--muted-text)" fontSize={12} />
            <YAxis
              stroke="var(--muted-text)"
              fontSize={12}
              tickFormatter={(v) => `${Math.round(v * 2.20462)} lb`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
              }}
              formatter={(value: number | undefined) =>
                value != null ? [formatWeight(value), "Weight"] : ["—", "Weight"]
              }
              labelFormatter={(label) => label}
            />
            <Line
              type="monotone"
              dataKey="weightKg"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={{ fill: "var(--chart-1)", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type ProgressRow = { sessionId: string; sessionDate: Date; bestSet: { weightKg: number; reps: number } };
type ProgressByExercise = { exerciseName: string; rows: ProgressRow[] };

function buildExerciseChartData(exercise: ProgressByExercise): BodyWeightPoint[] {
  return [...exercise.rows]
    .sort((a, b) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime())
    .map((r) => ({
      date: new Date(r.sessionDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "2-digit",
      }),
      weightKg: r.bestSet.weightKg,
      weightLb: formatWeight(r.bestSet.weightKg),
    }));
}

export function ExerciseWeightChart({ progress }: { progress: ProgressByExercise[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (progress.length === 0) return null;

  const selected = progress[selectedIndex];
  const chartData = buildExerciseChartData(selected);

  return (
    <div className="card">
      <h3 className="mb-4 font-semibold text-[var(--text)]">Exercise weight over time</h3>
      <p className="mb-4 text-sm text-muted">
        Best set weight (lb) per session
      </p>
      <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
        {progress.map((ex, i) => (
          <button
            key={ex.exerciseName}
            type="button"
            onClick={() => setSelectedIndex(i)}
            className={`rounded px-3 py-1.5 text-sm font-medium outline-none transition-colors focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
              selectedIndex === i
                ? "bg-primary text-white"
                : "bg-background text-muted hover:bg-border hover:text-[var(--text)]"
            }`}
          >
            {ex.exerciseName}
          </button>
        ))}
      </div>
      <div className="h-64">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" stroke="var(--muted-text)" fontSize={12} />
              <YAxis
                stroke="var(--muted-text)"
                fontSize={12}
                tickFormatter={(v) => `${Math.round(v * 2.20462)} lb`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                }}
                formatter={(value: number | undefined) =>
                  value != null ? [formatWeight(value), "Weight"] : ["—", "Weight"]
                }
                labelFormatter={(label) => label}
              />
              <Line
                type="monotone"
                dataKey="weightKg"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ fill: "var(--chart-1)", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            No session data for {selected.exerciseName} yet
          </div>
        )}
      </div>
    </div>
  );
}
