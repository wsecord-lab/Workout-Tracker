import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import ExcelJS from "exceljs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || (session.user as { role?: string }).role !== "TRAINER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const includeClients = searchParams.get("includeClients") ?? "1";
  const includeSessions = searchParams.get("includeSessions") ?? "1";
  const includeSets = searchParams.get("includeSets") ?? "1";
  const clientId = searchParams.get("clientId") ?? "all";
  const startDateParam = searchParams.get("startDate") ?? "";
  const endDateParam = searchParams.get("endDate") ?? "";

  if (includeClients !== "1" && includeSessions !== "1" && includeSets !== "1") {
    return NextResponse.json(
      { message: "At least one of includeClients, includeSessions, or includeSets must be 1." },
      { status: 400 }
    );
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const epoch = new Date("1970-01-01");

  let startDate: Date = epoch;
  let endDate: Date = today;
  if (startDateParam && endDateParam) {
    startDate = new Date(startDateParam);
    endDate = new Date(endDateParam);
    if (startDate > endDate) {
      return NextResponse.json(
        { message: "startDate must be before or equal to endDate." },
        { status: 400 }
      );
    }
  } else if (startDateParam) {
    startDate = new Date(startDateParam);
    endDate = today;
  } else if (endDateParam) {
    endDate = new Date(endDateParam);
    startDate = epoch;
  }

  const clientFilter = clientId !== "all" ? { id: clientId } : undefined;

  const workbook = new ExcelJS.Workbook();

  if (includeClients === "1") {
    const clients = await prisma.client.findMany({
      where: clientFilter,
      orderBy: { name: "asc" },
      select: {
        name: true,
        age: true,
        heightCm: true,
        bodyWeightKg: true,
        user: { select: { email: true } },
      },
    });
    const sheet = workbook.addWorksheet("Clients", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: "Name", key: "name", width: 20 },
      { header: "Age", key: "age", width: 8 },
      { header: "Height (cm)", key: "heightCm", width: 12 },
      { header: "Body weight (kg)", key: "bodyWeightKg", width: 16 },
      { header: "Linked email", key: "linkedEmail", width: 28 },
    ];
    sheet.getRow(1).font = { bold: true };
    clients.forEach((c) => {
      sheet.addRow({
        name: c.name,
        age: c.age,
        heightCm: c.heightCm,
        bodyWeightKg: c.bodyWeightKg,
        linkedEmail: c.user?.email ?? "",
      });
    });
  }

  if (includeSessions === "1") {
    const sessions = await prisma.workoutSession.findMany({
      where: {
        ...(clientFilter ? { clientId: clientFilter.id } : {}),
        date: { gte: startDate, lte: endDate },
      },
      orderBy: [{ clientId: "asc" }, { date: "asc" }],
      select: {
        name: true,
        date: true,
        client: { select: { name: true } },
      },
    });
    const sheet = workbook.addWorksheet("Sessions", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: "Client name", key: "clientName", width: 20 },
      { header: "Date", key: "date", width: 12 },
      { header: "Weekday", key: "weekday", width: 12 },
      { header: "Session name", key: "sessionName", width: 24 },
    ];
    sheet.getRow(1).font = { bold: true };
    sessions.forEach((s) => {
      const d = new Date(s.date);
      sheet.addRow({
        clientName: s.client.name,
        date: d.toISOString().slice(0, 10),
        weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
        sessionName: s.name ?? "",
      });
    });
  }

  if (includeSets === "1") {
    const sessionsInRange = await prisma.workoutSession.findMany({
      where: {
        ...(clientFilter ? { clientId: clientFilter.id } : {}),
        date: { gte: startDate, lte: endDate },
      },
      select: { id: true },
    });
    const sessionIds = sessionsInRange.map((s) => s.id);

    const sets = await prisma.set.findMany({
      where: { exercise: { sessionId: { in: sessionIds } } },
      select: {
        weightKg: true,
        reps: true,
        rpe: true,
        notes: true,
        exercise: {
          select: {
            name: true,
            session: {
              select: {
                date: true,
                name: true,
                client: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const sheet = workbook.addWorksheet("Sets", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: "Client name", key: "clientName", width: 20 },
      { header: "Session date", key: "sessionDate", width: 12 },
      { header: "Weekday", key: "weekday", width: 12 },
      { header: "Session name", key: "sessionName", width: 24 },
      { header: "Exercise", key: "exerciseName", width: 24 },
      { header: "Set index", key: "setIndex", width: 10 },
      { header: "Weight (kg)", key: "weightKg", width: 12 },
      { header: "Reps", key: "reps", width: 8 },
      { header: "RPE", key: "rpe", width: 8 },
      { header: "Notes", key: "notes", width: 24 },
    ];
    sheet.getRow(1).font = { bold: true };

    const sorted = [...sets].sort(
      (a, b) =>
        new Date(a.exercise.session.date).getTime() - new Date(b.exercise.session.date).getTime()
    );
    sorted.forEach((set, idx) => {
      const d = new Date(set.exercise.session.date);
      sheet.addRow({
        clientName: set.exercise.session.client.name,
        sessionDate: d.toISOString().slice(0, 10),
        weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
        sessionName: set.exercise.session.name ?? "",
        exerciseName: set.exercise.name,
        setIndex: idx + 1,
        weightKg: set.weightKg,
        reps: set.reps,
        rpe: set.rpe ?? "",
        notes: set.notes ?? "",
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="workout-export.xlsx"',
    },
  });
}
