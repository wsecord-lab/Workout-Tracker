import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { COMPLETED_SET_WHERE } from "@/lib/sets";

const WHOOP_CLIENTS = ["Will Secord", "Jack Secord"];

function kgToLb(kg: number): string {
  const lb = kg * 2.20462;
  return lb % 1 === 0 ? String(Math.round(lb)) : lb.toFixed(1);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
  }

  const workoutSession = await prisma.workoutSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      name: true,
      date: true,
      notes: true,
      client: { select: { name: true, userId: true, trainerId: true } },
      exercises: {
        where: { deletedAt: null },
        orderBy: { orderIndex: "asc" },
        select: {
          name: true,
          notes: true,
          sets: {
            // Export what was actually performed; planned-but-skipped sets are
            // targets, not results, so an all-planned session exports as
            // "(No sets logged)".
            where: COMPLETED_SET_WHERE,
            orderBy: { orderIndex: "asc" },
            select: { weightKg: true, reps: true, rpe: true, notes: true },
          },
        },
      },
    },
  });

  if (!workoutSession) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  // Only allowed for Will Secord and Jack Secord
  if (!WHOOP_CLIENTS.includes(workoutSession.client.name)) {
    return NextResponse.json({ error: "Whoop export is not enabled for this client." }, { status: 403 });
  }

  // Auth check: must be the trainer or the client themselves
  const role = (session.user as { role?: string }).role;
  const userId = session.user.id;
  const isOwner = workoutSession.client.userId === userId;
  const isTrainer = role === "TRAINER" && workoutSession.client.trainerId === userId;
  if (!isOwner && !isTrainer) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Build plain-text output
  const d = new Date(workoutSession.date);
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const sessionTitle = workoutSession.name
    ? `${weekday}, ${dateStr} — ${workoutSession.name}`
    : `${weekday}, ${dateStr}`;

  const lines: string[] = [];
  lines.push("WORKOUT LOG");
  lines.push(`Client: ${workoutSession.client.name}`);
  lines.push(`Exported: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`);
  lines.push("");
  lines.push(sessionTitle);
  lines.push("=".repeat(sessionTitle.length));

  if (workoutSession.notes?.trim()) {
    lines.push(`Notes: ${workoutSession.notes.trim()}`);
  }

  const validExercises = workoutSession.exercises.filter((e) => e.sets.length > 0);

  if (validExercises.length === 0) {
    lines.push("(No sets logged)");
  } else {
    for (const ex of validExercises) {
      lines.push("");
      lines.push(`${ex.name}${ex.notes?.trim() ? ` (${ex.notes.trim()})` : ""}`);
      ex.sets.forEach((set, i) => {
        let line = `  Set ${i + 1}: ${kgToLb(set.weightKg)} lb × ${set.reps} rep${set.reps !== 1 ? "s" : ""}`;
        if (set.rpe != null) line += `, RPE ${set.rpe}`;
        if (set.notes?.trim()) line += `, "${set.notes.trim()}"`;
        lines.push(line);
      });
    }
  }

  const text = lines.join("\n");
  const safeDate = d.toISOString().slice(0, 10);
  const safeName = workoutSession.client.name.replace(/\s+/g, "-").toLowerCase();
  const filename = `whoop-${safeName}-${safeDate}.txt`;

  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
