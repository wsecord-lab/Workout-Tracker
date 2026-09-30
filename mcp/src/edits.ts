import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { normalizeSessionName } from "./data";
import { kgToLb } from "./metrics";
import {
  assertSessionEditable,
  enforceWriteLimit,
  recordChange,
  sameSnapshot,
} from "./safeguards";
import { clientScope, type Actor } from "./trainer";

const LB_PER_KG = 2.2046226218;

/** Tools whose changes `undo_ai_change` knows how to reverse. */
const UNDOABLE_TOOLS = new Set(["update_session", "update_set", "add_exercise_to_session"]);

type SessionSnapshot = {
  name: string | null;
  normalizedName: string | null;
  notes: string | null;
  date: string;
};

type SetSnapshot = {
  weightKg: number;
  reps: number;
  plannedWeightKg: number | null;
  plannedReps: number | null;
};

function sessionSnapshot(s: {
  name: string | null;
  normalizedName: string | null;
  notes: string | null;
  date: Date;
}): SessionSnapshot {
  return {
    name: s.name,
    normalizedName: s.normalizedName,
    notes: s.notes,
    date: s.date.toISOString(),
  };
}

function setSnapshot(s: SetSnapshot): SetSnapshot {
  return {
    weightKg: s.weightKg,
    reps: s.reps,
    plannedWeightKg: s.plannedWeightKg,
    plannedReps: s.plannedReps,
  };
}

async function findEditableSession(actor: Actor, sessionId: string) {
  const session = await prisma.workoutSession.findFirst({
    where: { id: sessionId, client: clientScope(actor) },
    select: { id: true, name: true, normalizedName: true, notes: true, date: true, finishedAt: true },
  });
  if (!session) throw new Error(`Session ${sessionId} not found for this account.`);
  assertSessionEditable(session);
  return session;
}

export async function updateSession(
  actor: Actor,
  args: { sessionId: string; name?: string; date?: string; notes?: string }
) {
  if (args.name === undefined && args.date === undefined && args.notes === undefined) {
    throw new Error("Nothing to change. Provide name, date, or notes.");
  }
  await enforceWriteLimit(actor);
  const session = await findEditableSession(actor, args.sessionId);

  const data: Prisma.WorkoutSessionUpdateInput = {};
  if (args.name !== undefined) {
    const name = args.name.trim();
    if (!name) throw new Error("name cannot be empty.");
    data.name = name;
    data.normalizedName = normalizeSessionName(name);
  }
  if (args.date !== undefined) data.date = new Date(`${args.date}T12:00:00.000Z`);
  if (args.notes !== undefined) data.notes = args.notes.trim() || null;

  const { updated, changeId } = await prisma.$transaction(async (tx) => {
    const updated = await tx.workoutSession.update({
      where: { id: session.id },
      data,
      select: { id: true, name: true, normalizedName: true, notes: true, date: true },
    });
    const change = await recordChange(tx, actor, {
      tool: "update_session",
      entityType: "session",
      entityId: session.id,
      sessionId: session.id,
      before: sessionSnapshot(session),
      after: sessionSnapshot(updated),
    });
    return { updated, changeId: change.id };
  });

  return {
    changeId,
    sessionId: updated.id,
    name: updated.name,
    date: updated.date.toISOString().slice(0, 10),
    notes: updated.notes,
    note: "Use undo_ai_change with this changeId to revert.",
  };
}

export async function updateSet(
  actor: Actor,
  args: { setId: string; weightLb?: number; reps?: number }
) {
  if (args.weightLb === undefined && args.reps === undefined) {
    throw new Error("Nothing to change. Provide weightLb or reps.");
  }
  await enforceWriteLimit(actor);

  const set = await prisma.set.findFirst({
    where: {
      id: args.setId,
      exercise: { deletedAt: null, session: { client: clientScope(actor) } },
    },
    select: {
      id: true,
      weightKg: true,
      reps: true,
      plannedWeightKg: true,
      plannedReps: true,
      completedAt: true,
      exercise: { select: { sessionId: true, session: { select: { finishedAt: true } } } },
    },
  });
  if (!set) throw new Error(`Set ${args.setId} not found for this account.`);
  assertSessionEditable(set.exercise.session);
  if (set.completedAt) {
    throw new Error("This set was already performed, so it is locked. Only planned sets can be edited.");
  }

  const weightKg = args.weightLb !== undefined ? args.weightLb / LB_PER_KG : set.weightKg;
  const reps = args.reps ?? set.reps;

  const { updated, changeId } = await prisma.$transaction(async (tx) => {
    const updated = await tx.set.update({
      where: { id: set.id },
      data: { weightKg, reps, plannedWeightKg: weightKg, plannedReps: reps },
      select: { id: true, weightKg: true, reps: true, plannedWeightKg: true, plannedReps: true },
    });
    const change = await recordChange(tx, actor, {
      tool: "update_set",
      entityType: "set",
      entityId: set.id,
      sessionId: set.exercise.sessionId,
      before: setSnapshot(set),
      after: setSnapshot(updated),
    });
    return { updated, changeId: change.id };
  });

  return {
    changeId,
    setId: updated.id,
    weightLb: kgToLb(updated.weightKg),
    reps: updated.reps,
    note: "Use undo_ai_change with this changeId to revert.",
  };
}

export async function addExerciseToSession(
  actor: Actor,
  args: { sessionId: string; name: string; sets?: number; weightLb?: number; reps?: number }
) {
  const name = args.name.trim();
  if (!name) throw new Error("name is required.");
  await enforceWriteLimit(actor);
  const session = await findEditableSession(actor, args.sessionId);

  const result = await prisma.$transaction(async (tx) => {
    const last = await tx.exercise.findFirst({
      where: { sessionId: session.id },
      orderBy: { orderIndex: "desc" },
      select: { orderIndex: true },
    });
    const exercise = await tx.exercise.create({
      data: { sessionId: session.id, name, orderIndex: (last?.orderIndex ?? -1) + 1 },
      select: { id: true },
    });

    const setIds: string[] = [];
    if (args.sets && args.sets > 0 && args.weightLb != null && args.reps != null) {
      const weightKg = args.weightLb / LB_PER_KG;
      for (let j = 0; j < args.sets; j++) {
        const s = await tx.set.create({
          data: {
            exerciseId: exercise.id,
            weightKg,
            reps: args.reps,
            plannedWeightKg: weightKg,
            plannedReps: args.reps,
            completedAt: null,
            orderIndex: j,
          },
          select: { id: true },
        });
        setIds.push(s.id);
      }
    }

    const change = await recordChange(tx, actor, {
      tool: "add_exercise_to_session",
      entityType: "exercise",
      entityId: exercise.id,
      sessionId: session.id,
      before: null,
      after: { name, setIds },
    });
    return { exerciseId: exercise.id, setIds, changeId: change.id };
  });

  return {
    ...result,
    note: "Use undo_ai_change with this changeId to remove it again.",
  };
}

export async function listChanges(actor: Actor, limit: number) {
  const rows = await prisma.mcpChange.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
  });
  return rows.map((r) => ({
    changeId: r.id,
    when: r.createdAt.toISOString(),
    tool: r.tool,
    entityType: r.entityType,
    entityId: r.entityId,
    sessionId: r.sessionId,
    before: r.before,
    after: r.after,
    undone: r.undoneAt != null,
    undoable: UNDOABLE_TOOLS.has(r.tool) && r.undoneAt == null,
  }));
}

export async function undoChange(actor: Actor, changeId: string) {
  const change = await prisma.mcpChange.findFirst({ where: { id: changeId, userId: actor.id } });
  if (!change) throw new Error(`Change ${changeId} not found.`);
  if (change.undoneAt) throw new Error("This change was already undone.");
  if (!UNDOABLE_TOOLS.has(change.tool)) {
    throw new Error(
      "This kind of change (creating a new workout) can't be undone by the AI. Delete it in the app if you don't want it."
    );
  }

  if (change.tool === "update_session") {
    const session = await findEditableSession(actor, change.entityId);
    if (!sameSnapshot(sessionSnapshot(session), change.after)) {
      throw new Error(
        "This workout was changed again after the AI edit, so undo would overwrite newer changes. Nothing was changed."
      );
    }
    const before = change.before as SessionSnapshot;
    await prisma.$transaction([
      prisma.workoutSession.update({
        where: { id: session.id },
        data: {
          name: before.name,
          normalizedName: before.normalizedName,
          notes: before.notes,
          date: new Date(before.date),
        },
      }),
      prisma.mcpChange.update({ where: { id: change.id }, data: { undoneAt: new Date() } }),
    ]);
    return { undone: change.id, restored: "workout name, date and notes" };
  }

  if (change.tool === "update_set") {
    const set = await prisma.set.findFirst({
      where: {
        id: change.entityId,
        exercise: { deletedAt: null, session: { client: clientScope(actor) } },
      },
      select: {
        id: true,
        weightKg: true,
        reps: true,
        plannedWeightKg: true,
        plannedReps: true,
        completedAt: true,
        exercise: { select: { session: { select: { finishedAt: true } } } },
      },
    });
    if (!set) throw new Error("That set no longer exists.");
    assertSessionEditable(set.exercise.session);
    if (set.completedAt) throw new Error("This set was performed since the edit, so it is locked.");
    if (!sameSnapshot(setSnapshot(set), change.after)) {
      throw new Error(
        "This set was changed again after the AI edit, so undo would overwrite newer changes. Nothing was changed."
      );
    }
    const before = change.before as SetSnapshot;
    await prisma.$transaction([
      prisma.set.update({ where: { id: set.id }, data: before }),
      prisma.mcpChange.update({ where: { id: change.id }, data: { undoneAt: new Date() } }),
    ]);
    return { undone: change.id, restored: "set weight and reps" };
  }

  // add_exercise_to_session: hide the exercise the AI added (soft removal, rows stay in the database).
  const exercise = await prisma.exercise.findFirst({
    where: { id: change.entityId, deletedAt: null, session: { client: clientScope(actor) } },
    select: {
      id: true,
      session: { select: { finishedAt: true } },
      sets: { select: { completedAt: true } },
    },
  });
  if (!exercise) throw new Error("That exercise is already gone.");
  assertSessionEditable(exercise.session);
  if (exercise.sets.some((s) => s.completedAt)) {
    throw new Error("Sets in this exercise were performed, so it can't be removed by the AI.");
  }
  await prisma.$transaction([
    prisma.exercise.update({ where: { id: exercise.id }, data: { deletedAt: new Date() } }),
    prisma.mcpChange.update({ where: { id: change.id }, data: { undoneAt: new Date() } }),
  ]);
  return { undone: change.id, restored: "exercise removed from the workout" };
}
