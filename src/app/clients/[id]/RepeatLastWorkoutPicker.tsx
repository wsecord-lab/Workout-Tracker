"use client";

import { useEffect, useState } from "react";
import { listRepeatableWorkouts, type RepeatableWorkoutOption } from "@/app/actions/sessions";
import { formatDuration } from "@/lib/session-duration";

function formatOptionDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function describeWorkoutOption(o: RepeatableWorkoutOption): string {
  const parts = [
    formatOptionDate(o.date),
    `${o.exerciseCount} exercise${o.exerciseCount === 1 ? "" : "s"}`,
    `${o.completedSetCount} set${o.completedSetCount === 1 ? "" : "s"}`,
  ];
  if (o.averageSeconds != null) parts.push(`avg ${formatDuration(o.averageSeconds)}`);
  return parts.join(" · ");
}

/**
 * "Copy last ___ workout" — pulls a previous session's exercises forward with
 * its sets as planned targets, without anyone having to save a template first.
 */
export function RepeatLastWorkoutPicker({
  clientId,
  value,
  onChange,
  id,
  label = "Copy a previous workout",
  disabled,
}: {
  clientId: string;
  value: string;
  onChange: (sessionId: string, option: RepeatableWorkoutOption | null) => void;
  id: string;
  label?: string;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<RepeatableWorkoutOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listRepeatableWorkouts(clientId).then((result) => {
      if (cancelled) return;
      setOptions(result.ok ? result.options : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading) {
    return <p className="text-xs text-muted">Looking up previous workouts…</p>;
  }
  if (options.length === 0) {
    return (
      <p className="text-xs text-muted">
        No previous named workouts to copy yet. Name a session (e.g. &ldquo;Upper Body&rdquo;) and it
        will show up here next time.
      </p>
    );
  }

  const selected = options.find((o) => o.sessionId === value) ?? null;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--text)]">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next, options.find((o) => o.sessionId === next) ?? null);
        }}
        disabled={disabled}
        className="input mt-1 w-full"
      >
        <option value="">Don&apos;t copy</option>
        {options.map((o) => (
          <option key={o.sessionId} value={o.sessionId}>
            {o.name} — {describeWorkoutOption(o)}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted">
        {selected
          ? `Copies the exercises and last time's ${selected.completedSetCount} set${selected.completedSetCount === 1 ? "" : "s"} in as planned targets to check off.`
          : "Copies the exercises and last time's sets in as planned targets to check off."}
      </p>
    </div>
  );
}
