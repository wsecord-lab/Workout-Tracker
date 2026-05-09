import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionAccessForApi } from "@/lib/authz";
import { revalidateClientWorkoutViews } from "@/lib/revalidate-client";

/**
 * POST /api/sessions/:sessionId/groups/:groupId/assign
 * Body: { exerciseInstanceIds: string[] } — assign these exercises to this group.
 * RBAC: Trainer must own client; client must own session.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string; groupId: string }> }
) {
  const { sessionId, groupId } = await context.params;
  const access = await getSessionAccessForApi(sessionId);
  if (!access.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { exerciseInstanceIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const ids = body.exerciseInstanceIds;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "exerciseInstanceIds must be an array of strings" }, { status: 400 });
  }
  const exerciseIds = (ids as string[]).map((id) => id.trim()).filter(Boolean);
  if (exerciseIds.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const exercisesInSession = await prisma.exercise.findMany({
    where: { id: { in: exerciseIds }, sessionId, deletedAt: null },
    select: { id: true },
  });
  const validIds = exercisesInSession.map((e) => e.id);
  if (validIds.length !== exerciseIds.length) {
    return NextResponse.json({ error: "One or more exercises not found in this session" }, { status: 404 });
  }

  await prisma.exercise.updateMany({
    where: { id: { in: validIds } },
    data: { groupId },
  });
  revalidateClientWorkoutViews(access.clientId);
  return NextResponse.json({ ok: true });
}
