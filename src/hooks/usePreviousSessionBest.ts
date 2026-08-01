"use client";

import { useCallback, useEffect, useState } from "react";

export type PreviousSessionBest =
  | {
      found: true;
      performedAt: string;
      weight: number;
      reps: number;
      rpe: number | null;
      notes: string | null;
      /** Sets completed for this exercise in that prior session. */
      setCount: number;
    }
  | { found: false };

const cache = new Map<string, PreviousSessionBest>();

function cacheKey(clientId: string, sessionDate: string, catalogExerciseId: string, exerciseName: string): string {
  return `${clientId}:${sessionDate}:${catalogExerciseId}:${exerciseName}`;
}

type Options = {
  clientId: string;
  sessionDate: Date | string;
  catalogExerciseId?: string | null;
  exerciseName?: string | null;
  enabled: boolean;
};

export function usePreviousSessionBest({
  clientId,
  sessionDate,
  catalogExerciseId,
  exerciseName,
  enabled,
}: Options): { data: PreviousSessionBest | null; loading: boolean } {
  const sessionDateStr = typeof sessionDate === "string" ? sessionDate : sessionDate.toISOString();
  const catId = catalogExerciseId ?? "";
  const name = exerciseName ?? "";
  const key = cacheKey(clientId, sessionDateStr, catId, name);

  const [data, setData] = useState<PreviousSessionBest | null>(() => (enabled ? cache.get(key) ?? null : null));
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!enabled || (!catId && !name.trim())) {
      setData(null);
      return;
    }
    const cached = cache.get(key);
    if (cached !== undefined) {
      setData(cached);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ sessionDate: sessionDateStr });
      if (catId) params.set("catalogExerciseId", catId);
      if (name.trim()) params.set("exerciseName", name.trim());
      const res = await fetch(`/api/clients/${clientId}/exercises/previous-session-best?${params}`);
      if (!res.ok) {
        setData({ found: false });
        return;
      }
      const json = (await res.json()) as PreviousSessionBest;
      setData(json);
      cache.set(key, json);
    } catch {
      setData({ found: false });
    } finally {
      setLoading(false);
    }
  }, [enabled, clientId, sessionDateStr, catId, name, key]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading };
}
