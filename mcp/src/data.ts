import { prisma } from "./db";
import { aggregateProgress, kgToLb, rangeStart, type MetricsRangeKey } from "./metrics";
import { assertClientOwned, type TrainerContext } from "./trainer";

function normalizeExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeSessionName(name: string | null | undefined): string | null {
  if (name == null) return null;
  const n = name.trim().replace(/\s+/g, " ").toLowerCase();
  return n.length ? n : null;
}

export async function listClients(trainer: TrainerContext) {
  const clients = await prisma.client.findMany({
    where: { trainerId: trainer.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      age: true,
      bodyWeightKg: true,
      sessions: {
        orderBy: { date: "desc" },
        take: 1,
        select: {
          id: true,
          name: true,
          date: true,
          startedAt: true,
          finishedAt: true,
          pausedAt: true,
        },
      },
    },
  });

  return clients.map((c) => {
    const last = c.sessions[0] ?? null;
    return {
      id: c.id,
      name: c.name,
      age: c.age,
      bodyWeightLb: kgToLb(c.bodyWeightKg),
      lastSession: last
        ? {
            id: last.id,
            name: last.name,
            date: last.date.toISOString().slice(0, 10),
            inProgress: Boolean(last.startedAt && !last.finishedAt),
            paused: Boolean(last.pausedAt && !last.finishedAt),
          }
        : null,
    };
  });
}

export async function getClient(trainer: TrainerContext, clientId: string) {
  await assertClientOwned(trainer.id, clientId);
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      age: true,
      heightCm: true,
      bodyWeightKg: true,
    },
  });
  return {
    ...client,
    heightIn: Math.round((client.heightCm / 2.54) * 10) / 10,
    bodyWeightLb: kgToLb(client.bodyWeightKg),
  };
}

export async function listSessions(
  trainer: TrainerContext,
  clientId: string,
  limit: number
) {
  await assertClientOwned(trainer.id, clientId);
  const sessions = await prisma.workoutSession.findMany({
    where: { clientId },
    orderBy: { date: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: {
      id: true,
      name: true,
      date: true,
      startedAt: true,
      finishedAt: true,
      pausedAt: true,
      notes: true,
      _count: { select: { exercises: true } },
    },
  });
  return sessions.map((s) => ({
    id: s.id,
    name: s.name,
    date: s.date.toISOString().slice(0, 10),
    exerciseCount: s._count.exercises,
    inProgress: Boolean(s.startedAt && !s.finishedAt),
    paused: Boolean(s.pausedAt && !s.finishedAt),
    finished: Boolean(s.finishedAt),
    notes: s.notes,
  }));
}

export async function getSession(trainer: TrainerContext, sessionId: string) {
  const session = await prisma.workoutSession.findFirst({
    where: {
      id: sessionId,
      client: { trainerId: trainer.id },
    },
    select: {
      id: true,
      name: true,
      date: true,
      notes: true,
      startedAt: true,
      finishedAt: true,
      pausedAt: true,
      client: { select: { id: true, name: true } },
      exercises: {
        where: { deletedAt: null },
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          name: true,
          orderIndex: true,
          groupId: true,
          sets: {
            orderBy: { orderIndex: "asc" },
            select: {
              id: true,
              weightKg: true,
              reps: true,
              plannedWeightKg: true,
              plannedReps: true,
              completedAt: true,
              orderIndex: true,
            },
          },
        },
      },
    },
  });
  if (!session) throw new Error(`Session ${sessionId} not found for this trainer.`);

  return {
    id: session.id,
    name: session.name,
    date: session.date.toISOString().slice(0, 10),
    notes: session.notes,
    client: session.client,
    inProgress: Boolean(session.startedAt && !session.finishedAt),
    paused: Boolean(session.pausedAt && !session.finishedAt),
    finished: Boolean(session.finishedAt),
    exercises: session.exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      orderIndex: ex.orderIndex,
      groupId: ex.groupId,
      sets: ex.sets.map((s) => ({
        id: s.id,
        orderIndex: s.orderIndex,
        weightLb: kgToLb(s.weightKg),
        reps: s.reps,
        plannedWeightLb:
          s.plannedWeightKg != null ? kgToLb(s.plannedWeightKg) : null,
        plannedReps: s.plannedReps,
        completed: s.completedAt != null,
      })),
    })),
  };
}

export async function getProgress(
  trainer: TrainerContext,
  clientId: string,
  range: MetricsRangeKey
) {
  await assertClientOwned(trainer.id, clientId);
  const since = rangeStart(range);
  const sessions = await prisma.workoutSession.findMany({
    where: { clientId, date: { gte: since } },
    select: {
      date: true,
      exercises: {
        where: { deletedAt: null },
        select: {
          name: true,
          sets: {
            select: { weightKg: true, reps: true, completedAt: true },
          },
        },
      },
    },
  });
  const progress = aggregateProgress(sessions);
  return {
    clientId,
    range,
    since: since.toISOString().slice(0, 10),
    totalVolumeLbReps: Math.round(progress.totalVolumeKgReps * 2.2046226218),
    exercises: progress.exercises.map((e) => ({
      name: e.name,
      bestE1RMLb: kgToLb(e.bestE1RMKg),
      bestWeightLb: kgToLb(e.bestWeightKg),
      bestSetVolumeLbReps: Math.round(e.bestSetVolume * 2.2046226218),
      prSessionDate: e.prSessionDate,
    })),
  };
}

export async function listTemplates(trainer: TrainerContext, includeArchived: boolean) {
  const templates = await prisma.workoutTemplate.findMany({
    where: {
      trainerId: trainer.id,
      ...(includeArchived ? {} : { isArchived: false }),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      isArchived: true,
      updatedAt: true,
      _count: { select: { items: true } },
    },
  });
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    isArchived: t.isArchived,
    itemCount: t._count.items,
    updatedAt: t.updatedAt.toISOString(),
  }));
}

export async function getTemplate(trainer: TrainerContext, templateId: string) {
  const template = await prisma.workoutTemplate.findFirst({
    where: { id: templateId, trainerId: trainer.id },
    select: {
      id: true,
      name: true,
      isArchived: true,
      items: {
        orderBy: { orderIndex: "asc" },
        select: {
          orderIndex: true,
          exerciseName: true,
          plannedSetCount: true,
          plannedWeightKg: true,
          plannedReps: true,
        },
      },
    },
  });
  if (!template) throw new Error(`Template ${templateId} not found.`);
  return {
    id: template.id,
    name: template.name,
    isArchived: template.isArchived,
    items: template.items.map((i) => ({
      orderIndex: i.orderIndex,
      exerciseName: i.exerciseName,
      plannedSetCount: i.plannedSetCount,
      plannedWeightLb:
        i.plannedWeightKg != null ? kgToLb(i.plannedWeightKg) : null,
      plannedReps: i.plannedReps,
    })),
  };
}

export async function createSessionFromTemplate(
  trainer: TrainerContext,
  args: {
    clientId: string;
    templateId: string;
    sessionName?: string;
    date?: string;
  }
) {
  await assertClientOwned(trainer.id, args.clientId);
  const template = await prisma.workoutTemplate.findFirst({
    where: {
      id: args.templateId,
      trainerId: trainer.id,
      isArchived: false,
    },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  if (!template) throw new Error("Template not found or archived.");

  const name = args.sessionName?.trim() || template.name;
  const date = args.date ? new Date(`${args.date}T12:00:00.000Z`) : new Date();

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.workoutSession.create({
      data: {
        clientId: args.clientId,
        name,
        normalizedName: normalizeSessionName(name),
        date,
      },
      select: { id: true },
    });

    for (let i = 0; i < template.items.length; i++) {
      const item = template.items[i];
      const exercise = await tx.exercise.create({
        data: {
          sessionId: created.id,
          name: item.exerciseName,
          orderIndex: i,
        },
        select: { id: true },
      });
      if (
        item.plannedSetCount != null &&
        item.plannedSetCount > 0 &&
        item.plannedWeightKg != null &&
        item.plannedReps != null
      ) {
        await tx.set.createMany({
          data: Array.from({ length: item.plannedSetCount }, (_, j) => ({
            exerciseId: exercise.id,
            weightKg: item.plannedWeightKg!,
            reps: item.plannedReps!,
            plannedWeightKg: item.plannedWeightKg!,
            plannedReps: item.plannedReps!,
            completedAt: null,
            orderIndex: j,
          })),
        });
      }
    }
    return created;
  });

  return {
    sessionId: session.id,
    name,
    date: date.toISOString().slice(0, 10),
    templateId: template.id,
    exerciseCount: template.items.length,
  };
}

export type PlannedExerciseInput = {
  name: string;
  sets?: number;
  /** Planned weight in pounds (UI units). */
  weightLb?: number;
  reps?: number;
};

export async function createPlannedSession(
  trainer: TrainerContext,
  args: {
    clientId: string;
    sessionName: string;
    date?: string;
    notes?: string;
    exercises: PlannedExerciseInput[];
  }
) {
  await assertClientOwned(trainer.id, args.clientId);
  if (!args.exercises.length) throw new Error("Provide at least one exercise.");

  const name = args.sessionName.trim();
  if (!name) throw new Error("sessionName is required.");
  const date = args.date ? new Date(`${args.date}T12:00:00.000Z`) : new Date();

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.workoutSession.create({
      data: {
        clientId: args.clientId,
        name,
        normalizedName: normalizeSessionName(name),
        date,
        notes: args.notes?.trim() || null,
      },
      select: { id: true },
    });

    for (let i = 0; i < args.exercises.length; i++) {
      const ex = args.exercises[i];
      const exerciseName = ex.name.trim();
      if (!exerciseName) continue;
      const exercise = await tx.exercise.create({
        data: {
          sessionId: created.id,
          name: exerciseName,
          orderIndex: i,
        },
        select: { id: true },
      });

      const setCount = ex.sets ?? 0;
      const weightLb = ex.weightLb;
      const reps = ex.reps;
      if (setCount > 0 && weightLb != null && reps != null) {
        const weightKg = weightLb / 2.2046226218;
        await tx.set.createMany({
          data: Array.from({ length: setCount }, (_, j) => ({
            exerciseId: exercise.id,
            weightKg,
            reps,
            plannedWeightKg: weightKg,
            plannedReps: reps,
            completedAt: null,
            orderIndex: j,
          })),
        });
      }
    }

    return created;
  });

  return {
    sessionId: session.id,
    name,
    date: date.toISOString().slice(0, 10),
    exerciseCount: args.exercises.length,
    note: "Planned sets are incomplete targets — open the session in the app to run the workout.",
  };
}

export async function listCatalog(trainer: TrainerContext) {
  const items = await prisma.trainerExerciseCatalogItem.findMany({
    where: { trainerId: trainer.id, isArchived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: 500,
  });
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    normalizedName: normalizeExerciseName(i.name),
  }));
}
