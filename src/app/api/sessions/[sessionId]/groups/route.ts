import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionAccessForApi } from "@/lib/authz";
import { revalidateClientWorkoutViews } from "@/lib/revalidate-client";
import { randomBytes } from "crypto";

/**
 * POST /api/sessions/:sessionId/groups
 * Body: { exerciseInstanceId: string } — create a new group and assign this exercise to it.
 * Response: { groupId: string }
 * RBAC: Trainer must own client; client must own session.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;
  const access = await getSessionAccessForApi(sessionId);
  if (!access.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { exerciseInstanceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const exerciseInstanceId = body.exerciseInstanceId;
  if (typeof exerciseInstanceId !== "string" || !exerciseInstanceId.trim()) {
    return NextResponse.json({ error: "exerciseInstanceId is required" }, { status: 400 });
  }

  const exercise = await prisma.exercise.findFirst({
    where: { id: exerciseInstanceId.trim(), sessionId, deletedAt: null },
    select: { id: true },
  });
  if (!exercise) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  const groupId = `grp_${randomBytes(8).toString("hex")}`;
  await prisma.exercise.update({
    where: { id: exerciseInstanceId.trim() },
    data: { groupId },
  });
  revalidateClientWorkoutViews(access.clientId);
  return NextResponse.json({ groupId });
}
