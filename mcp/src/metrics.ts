/** Lightweight metrics for MCP (mirrors app aggregation; completed sets only). */

function epley1RM(weightKg: number, reps: number): number {
  if (reps <= 0) return weightKg;
  return weightKg * (1 + reps / 30);
}

export type MetricsRangeKey = "7d" | "30d" | "90d";

export function rangeStart(range: MetricsRangeKey, now = new Date()): Date {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

export function aggregateProgress(
  sessions: Array<{
    date: Date;
    exercises: Array<{
      name: string;
      sets: Array<{ weightKg: number; reps: number; completedAt: Date | null }>;
    }>;
  }>
) {
  let totalVolumeKgReps = 0;
  const byExercise = new Map<
    string,
    { bestE1RM: number; bestWeightKg: number; bestVolume: number; sessionDate: string }
  >();

  for (const session of sessions) {
    const sessionDate = session.date.toISOString().slice(0, 10);
    for (const ex of session.exercises) {
      for (const set of ex.sets) {
        if (set.completedAt == null) continue;
        const vol = set.weightKg * set.reps;
        totalVolumeKgReps += vol;
        const e1rm = epley1RM(set.weightKg, set.reps);
        const existing = byExercise.get(ex.name);
        if (!existing) {
          byExercise.set(ex.name, {
            bestE1RM: e1rm,
            bestWeightKg: set.weightKg,
            bestVolume: vol,
            sessionDate,
          });
        } else {
          if (e1rm > existing.bestE1RM) {
            existing.bestE1RM = e1rm;
            existing.bestWeightKg = set.weightKg;
            existing.sessionDate = sessionDate;
          }
          if (vol > existing.bestVolume) existing.bestVolume = vol;
        }
      }
    }
  }

  return {
    totalVolumeKgReps: Math.round(totalVolumeKgReps * 100) / 100,
    exercises: [...byExercise.entries()]
      .map(([name, m]) => ({
        name,
        bestE1RMKg: Math.round(m.bestE1RM * 100) / 100,
        bestWeightKg: m.bestWeightKg,
        bestSetVolume: Math.round(m.bestVolume * 100) / 100,
        prSessionDate: m.sessionDate,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function kgToLb(kg: number): number {
  return Math.round(kg * 2.2046226218 * 10) / 10;
}
