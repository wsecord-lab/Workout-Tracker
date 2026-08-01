import type { WorkoutSession, Exercise, Set as PrismaSet } from "@prisma/client";
import { isCompletedSet } from "@/lib/sets";

type ExerciseWithSets = Exercise & { sets: PrismaSet[] };
type SessionWithExercises = WorkoutSession & { exercises: ExerciseWithSets[] };

export type BestSet = { weightKg: number; reps: number };
export type ProgressRow = { sessionId: string; sessionDate: Date; bestSet: BestSet };
export type ProgressByExercise = { exerciseName: string; rows: ProgressRow[] };

/**
 * Best *performed* set. Planned-but-not-completed sets are excluded: their
 * weightKg/reps are a target, so including them would report work as done that
 * never happened. Exported for testing.
 */
export function pickBestSet(sets: PrismaSet[]): BestSet | null {
  const performed = sets.filter(isCompletedSet);
  if (performed.length === 0) return null;
  let best = performed[0];
  for (let i = 1; i < performed.length; i++) {
    const s = performed[i];
    if (s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps)) {
      best = s;
    }
  }
  return { weightKg: best.weightKg, reps: best.reps };
}

export function getProgressByExercise(sessions: SessionWithExercises[]): ProgressByExercise[] {
  const byName = new Map<string, ProgressRow[]>();
  for (const session of sessions) {
    for (const ex of session.exercises) {
      const best = pickBestSet(ex.sets);
      if (!best) continue;
      const rows = byName.get(ex.name) ?? [];
      rows.push({
        sessionId: session.id,
        sessionDate: session.date,
        bestSet: best,
      });
      byName.set(ex.name, rows);
    }
  }
  return Array.from(byName.entries()).map(([exerciseName, rows]) => ({
    exerciseName,
    rows: rows.sort((a, b) => b.sessionDate.getTime() - a.sessionDate.getTime()),
  }));
}
