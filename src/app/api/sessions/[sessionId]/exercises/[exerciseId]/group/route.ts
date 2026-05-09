import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionAccessForApi } from "@/lib/authz";
import { revalidateClientWorkoutViews } from "@/lib/revalidate-client";

/**
 * POST /api/sessions/:sessionId/exercises/:exerciseId/group
 * Body: { groupId: string | null } — null = ungroup
 * RBAC: Trainer must own client; client must own session.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string; exerciseId: string }> }
) {
  const { sessionId, exerciseId } = await context.params;
  const access = await getSessionAccessForApi(sessionId);
  if (!access.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { groupId: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const groupId = body.groupId === undefined ? undefined : (body.groupId as string | null);
  if (groupId !== null && (typeof groupId !== "string" || !groupId.trim())) {
    return NextResponse.json({ error: "groupId must be a non-empty string or null" }, { status: 400 });
  }

  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseId, sessionId, deletedAt: null },
    select: { id: true },
  });
  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  await prisma.exercise.update({
    where: { id: exerciseId },
    data: { groupId: groupId?.trim() || null },
  });
  revalidateClientWorkoutViews(access.clientId);
  return NextResponse.json({ ok: true });
}
