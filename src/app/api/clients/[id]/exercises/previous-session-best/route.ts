import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getClientAccessForApi } from "@/lib/authz";
import { normalizeExerciseName } from "@/lib/normalize-exercise-name";
import { COMPLETED_SET_WHERE } from "@/lib/sets";

export type PreviousSessionBestResponse =
  | {
      found: true;
      performedAt: string;
      weight: number;
      reps: number;
      rpe: number | null;
      notes: string | null;
      /** How many sets of this exercise were completed in that prior session. */
      setCount: number;
    }
  | { found: false };

/**
 * GET /api/clients/:clientId/exercises/previous-session-best
 * Query: sessionDate (ISO), catalogExerciseId? (optional), exerciseName? (optional).
 * At least one of catalogExerciseId or exerciseName required.
 * Returns set count + best set from the most recent prior session where the
 * client actually performed this exercise.
 * RBAC: the owning trainer, or the client themselves.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await context.params;
  const access = await getClientAccessForApi(clientId);
  if (!access.allowed) {
    const message =
      access.status === 401 ? "Unauthorized" : access.status === 404 ? "Client not found" : "Forbidden";
    return NextResponse.json({ error: message }, { status: access.status });
  }

  const sessionDateParam = request.nextUrl.searchParams.get("sessionDate");
  const catalogExerciseId = request.nextUrl.searchParams.get("catalogExerciseId") ?? undefined;
  const exerciseName = request.nextUrl.searchParams.get("exerciseName") ?? undefined;

  if (!sessionDateParam?.trim()) {
    return NextResponse.json(
      { error: "sessionDate is required (ISO date string)" },
      { status: 400 }
    );
  }
  const sessionDate = new Date(sessionDateParam);
  if (Number.isNaN(sessionDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid sessionDate" },
      { status: 400 }
    );
  }
  if (!catalogExerciseId && !exerciseName?.trim()) {
    return NextResponse.json(
      { error: "At least one of catalogExerciseId or exerciseName is required" },
      { status: 400 }
    );
  }

  const normalizedInputName = exerciseName?.trim()
    ? normalizeExerciseName(exerciseName)
    : "";

  function exerciseMatches(ex: { catalogExerciseId: string | null; name: string }): boolean {
    if (catalogExerciseId && ex.catalogExerciseId === catalogExerciseId) return true;
    if (normalizedInputName && normalizeExerciseName(ex.name) === normalizedInputName) return true;
    return false;
  }

  // Fetch recent prior sessions and find the first that contains this exercise
  const priorSessions = await prisma.workoutSession.findMany({
    where: {
      clientId,
      date: { lt: sessionDate },
    },
    orderBy: { date: "desc" },
    take: 20,
    include: {
      exercises: {
        where: { deletedAt: null },
        include: { sets: { where: COMPLETED_SET_WHERE } },
      },
    },
  });

  // Require sets, not just a matching exercise. Matching on presence alone let a
  // session that merely listed the exercise (now: one that only *planned* it)
  // shadow the real history behind it and report "no previous history".
  const priorSession = priorSessions.find((s) =>
    s.exercises.filter(exerciseMatches).some((ex) => ex.sets.length > 0)
  );
  if (!priorSession) {
    return NextResponse.json<PreviousSessionBestResponse>({ found: false });
  }

  const matchingExercises = priorSession.exercises.filter(exerciseMatches);
  const allSets = matchingExercises.flatMap((ex) => ex.sets);

  // Best: highest weight, tie-break reps, then createdAt
  const best = allSets.slice().sort((a, b) => {
    if (a.weightKg !== b.weightKg) return b.weightKg - a.weightKg;
    if (a.reps !== b.reps) return b.reps - a.reps;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  })[0];

  return NextResponse.json<PreviousSessionBestResponse>(
    {
      found: true,
      performedAt: priorSession.date.toISOString(),
      weight: best.weightKg,
      reps: best.reps,
      rpe: best.rpe ?? null,
      notes: best.notes ?? null,
      setCount: allSets.length,
    },
    // Clients now hit this too — one request per exercise per render.
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}
