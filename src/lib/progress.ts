import type { WorkoutSession, Exercise, Set } from "@prisma/client";

type ExerciseWithSets = Exercise & { sets: Set[] };
type SessionWithExercises = WorkoutSession & { exercises: ExerciseWithSets[] };

export type BestSet = { weightKg: number; reps: number };
export type ProgressRow = { sessionId: string; sessionDate: Date; bestSet: BestSet };
export type ProgressByExercise = { exerciseName: string; rows: ProgressRow[] };

function pickBestSet(sets: Set[]): BestSet | null {
  if (sets.length === 0) return null;
  let best = sets[0];
  for (let i = 1; i < sets.length; i++) {
    const s = sets[i];
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
