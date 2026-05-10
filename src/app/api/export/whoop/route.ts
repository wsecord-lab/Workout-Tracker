import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/** Convert kg to lb for display, matching the app's user-facing unit. */
function kgToLb(kg: number): string {
  const lb = kg * 2.20462;
  return lb % 1 === 0 ? String(Math.round(lb)) : lb.toFixed(1);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string }).role;
  const userId = session.user.id;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId") ?? "all";
  const startDateParam = searchParams.get("startDate") ?? "";
  const endDateParam = searchParams.get("endDate") ?? "";

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const epoch = new Date("1970-01-01");

  let startDate: Date = epoch;
  let endDate: Date = today;
  if (startDateParam) startDate = new Date(startDateParam);
  if (endDateParam) {
    endDate = new Date(endDateParam);
    endDate.setHours(23, 59, 59, 999);
  }

  let clientWhere: object;

  if (role === "TRAINER") {
    // Trainers can export any of their clients
    if (clientId !== "all") {
      const client = await prisma.client.findFirst({
        where: { id: clientId, trainerId: userId },
        select: { id: true },
      });
      if (!client) {
        return NextResponse.json({ error: "Forbidden or client not found." }, { status: 403 });
      }
      clientWhere = { id: clientId, trainerId: userId };
    } else {
      clientWhere = { trainerId: userId };
    }
  } else {
    // Clients can only export their own data
    const clientRecord = await prisma.client.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!clientRecord) {
      return NextResponse.json({ error: "Client profile not found." }, { status: 403 });
    }
    clientWhere = { id: clientRecord.id };
  }

  const sessions = await prisma.workoutSession.findMany({
    where: {
      client: clientWhere,
      date: { gte: startDate, lte: endDate },
    },
    orderBy: [{ clientId: "asc" }, { date: "asc" }],
    select: {
      name: true,
      date: true,
      notes: true,
      client: { select: { name: true } },
      exercises: {
        where: { deletedAt: null },
        orderBy: { orderIndex: "asc" },
        select: {
          name: true,
          notes: true,
          sets: {
            orderBy: { orderIndex: "asc" },
            select: { weightKg: true, reps: true, rpe: true, notes: true },
          },
        },
      },
    },
  });

  // Build plain-text output
  const exportDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const lines: string[] = [];
  lines.push("WORKOUT LOG");
  lines.push(`Exported: ${exportDate}`);
  if (startDateParam || endDateParam) {
    const from = startDateParam
      ? new Date(startDateParam).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "all time";
    const to = endDateParam
      ? new Date(endDateParam).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "today";
    lines.push(`Period: ${from} – ${to}`);
  }
  lines.push("");

  if (sessions.length === 0) {
    lines.push("No sessions found for the selected filters.");
  }

  let currentClientName = "";

  for (const s of sessions) {
    // Group by client (when exporting multiple clients)
    if (s.client.name !== currentClientName) {
      currentClientName = s.client.name;
      lines.push("=".repeat(60));
      lines.push(`CLIENT: ${s.client.name.toUpperCase()}`);
      lines.push("=".repeat(60));
      lines.push("");
    }

    const d = new Date(s.date);
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    const dateStr = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const sessionTitle = s.name ? `${weekday}, ${dateStr} — ${s.name}` : `${weekday}, ${dateStr}`;

    lines.push(sessionTitle);
    lines.push("-".repeat(sessionTitle.length));

    if (s.notes?.trim()) {
      lines.push(`Session notes: ${s.notes.trim()}`);
    }

    const validExercises = s.exercises.filter((e) => e.sets.length > 0);

    if (validExercises.length === 0) {
      lines.push("  (No sets logged)");
    } else {
      for (const ex of validExercises) {
        lines.push("");
        lines.push(`  ${ex.name}${ex.notes?.trim() ? ` — ${ex.notes.trim()}` : ""}`);
        ex.sets.forEach((set, i) => {
          let setLine = `    Set ${i + 1}: ${kgToLb(set.weightKg)} lb × ${set.reps} rep${set.reps !== 1 ? "s" : ""}`;
          if (set.rpe != null) setLine += `, RPE ${set.rpe}`;
          if (set.notes?.trim()) setLine += `, "${set.notes.trim()}"`;
          lines.push(setLine);
        });
      }
    }

    lines.push("");
  }

  const text = lines.join("\n");
  const filename = `workout-log-${new Date().toISOString().slice(0, 10)}.txt`;

  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
