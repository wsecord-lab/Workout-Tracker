"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSessionDuration } from "@/app/actions/sessions";
import {
  formatDuration,
  getSessionDurationSeconds,
  parseDurationMinutes,
  type DurationSource,
} from "@/lib/session-duration";

export function SessionDurationEditor({
  sessionId,
  clientId,
  session,
}: {
  sessionId: string;
  clientId: string;
  session: DurationSource;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const seconds = getSessionDurationSeconds(session);
  const isManual = session.durationSeconds != null;
  const [value, setValue] = useState(seconds != null ? String(Math.round(seconds / 60)) : "");

  function save(minutes: number | null) {
    setError(null);
    startTransition(async () => {
      const result = await updateSessionDuration(sessionId, clientId, minutes);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function handleSave() {
    const parsed = parseDurationMinutes(value);
    if (parsed === undefined) {
      setError("Enter a whole number of minutes (1–1440).");
      return;
    }
    save(parsed);
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Duration:</span>
        <span className="font-medium">{formatDuration(seconds)}</span>
        {isManual && <span className="text-xs text-muted">(edited)</span>}
        <button
          type="button"
          onClick={() => {
            setValue(seconds != null ? String(Math.round(seconds / 60)) : "");
            setEditing(true);
          }}
          className="text-xs text-primary hover:text-primary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded"
        >
          {seconds == null ? "Add duration" : "Edit"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`duration-${sessionId}`} className="text-muted">
          Duration
        </label>
        <input
          id={`duration-${sessionId}`}
          type="number"
          min={1}
          max={1440}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="min"
          className="input w-20 px-1.5 py-0.5 text-sm min-h-[44px] sm:min-h-0"
          disabled={isPending}
          autoFocus
        />
        <span className="text-xs text-muted">min</span>
        <button type="button" onClick={handleSave} disabled={isPending} className="btn-primary text-xs py-1 px-2">
          {isPending ? "…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          disabled={isPending}
          className="btn-secondary text-xs py-1 px-2"
        >
          Cancel
        </button>
        {isManual && (
          // Clearing the override goes back to the measured Start→Finish span.
          <button
            type="button"
            onClick={() => save(null)}
            disabled={isPending}
            className="text-xs text-muted hover:text-[var(--text)] hover:underline outline-none focus:ring-2 focus:ring-primary rounded"
          >
            Reset to auto
          </button>
        )}
      </div>
      {error && <span className="text-xs text-error">{error}</span>}
    </div>
  );
}
