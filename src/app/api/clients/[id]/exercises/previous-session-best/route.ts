import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { normalizeExerciseName } from "@/lib/normalize-exercise-name";

export type PreviousSessionBestResponse =
  | { found: true; performedAt: string; weight: number; reps: number; rpe: number | null; notes: string | null }
  | { found: false };

/**
 * GET /api/clients/:clientId/exercises/previous-session-best
 * Query: sessionDate (ISO), catalogExerciseId? (optional), exerciseName? (optional).
 * At least one of catalogExerciseId or exerciseName required.
 * Returns the best set from the most recent prior session where the client did this exercise.
 * RBAC: Only trainers who own the client may call; 403 otherwise.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await context.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "TRAINER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { trainerId: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  if (client.trainerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
        include: { sets: true },
      },
    },
  });

  const priorSession = priorSessions.find((s) => s.exercises.some(exerciseMatches));
  if (!priorSession) {
    return NextResponse.json<PreviousSessionBestResponse>({ found: false });
  }

  const matchingExercises = priorSession.exercises.filter(exerciseMatches);

  const allSets = matchingExercises.flatMap((ex) => ex.sets);
  if (allSets.length === 0) {
    return NextResponse.json<PreviousSessionBestResponse>({ found: false });
  }

  // Best: highest weight, tie-break reps, then createdAt
  const best = allSets.slice().sort((a, b) => {
    if (a.weightKg !== b.weightKg) return b.weightKg - a.weightKg;
    if (a.reps !== b.reps) return b.reps - a.reps;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  })[0];

  return NextResponse.json<PreviousSessionBestResponse>({
    found: true,
    performedAt: priorSession.date.toISOString(),
    weight: best.weightKg,
    reps: best.reps,
    rpe: best.rpe ?? null,
    notes: best.notes ?? null,
  });
}
