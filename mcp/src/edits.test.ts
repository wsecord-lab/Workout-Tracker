import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => {
  const tx = {
    workoutSession: { update: vi.fn() },
    set: { update: vi.fn(), create: vi.fn() },
    exercise: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    mcpChange: { create: vi.fn() },
    sessionWarmupItem: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  };
  return {
    tx,
    prisma: {
      workoutSession: { findFirst: vi.fn(), update: vi.fn() },
      set: { findFirst: vi.fn(), update: vi.fn() },
      exercise: { findFirst: vi.fn(), update: vi.fn() },
      mcpChange: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
      sessionWarmupItem: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
      $transaction: vi.fn(async (arg: unknown) =>
        typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[])
      ),
    },
  };
});
vi.mock("./db", () => ({ prisma: m.prisma }));

import { MAX_WRITES_PER_HOUR } from "./safeguards";
import { addExerciseToSession, setSessionWarmup, undoChange, updateSession, updateSet } from "./edits";
import type { Actor } from "./trainer";

const client: Actor = { id: "u-client", email: "c@x.y", name: null, role: "CLIENT", apiKeyId: "k1" };
const trainer: Actor = { id: "u-trainer", email: "t@x.y", name: null, role: "TRAINER", apiKeyId: "k2" };

const openSession = {
  id: "s1",
  name: "Push",
  normalizedName: "push",
  notes: null,
  date: new Date("2026-10-01T12:00:00.000Z"),
  finishedAt: null,
};

describe("AI edit safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.mcpChange.count.mockResolvedValue(0);
    m.tx.mcpChange.create.mockResolvedValue({ id: "chg1" });
  });

  it("scopes a client to their own data and a trainer to their clients", async () => {
    m.prisma.workoutSession.findFirst.mockResolvedValue(null);
    await expect(updateSession(client, { sessionId: "s1", name: "x" })).rejects.toThrow(/not found/);
    expect(m.prisma.workoutSession.findFirst.mock.calls[0][0].where.client).toEqual({ userId: "u-client" });

    await expect(updateSession(trainer, { sessionId: "s1", name: "x" })).rejects.toThrow(/not found/);
    expect(m.prisma.workoutSession.findFirst.mock.calls[1][0].where.client).toEqual({ trainerId: "u-trainer" });
  });

  it("locks finished workouts", async () => {
    m.prisma.workoutSession.findFirst.mockResolvedValue({ ...openSession, finishedAt: new Date() });
    await expect(updateSession(client, { sessionId: "s1", name: "New" })).rejects.toThrow(/finished/);
    await expect(
      addExerciseToSession(client, { sessionId: "s1", name: "Squat" })
    ).rejects.toThrow(/finished/);
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("locks sets that were already performed", async () => {
    m.prisma.set.findFirst.mockResolvedValue({
      id: "set1",
      weightKg: 50,
      reps: 5,
      plannedWeightKg: 50,
      plannedReps: 5,
      completedAt: new Date(),
      exercise: { sessionId: "s1", session: { finishedAt: null } },
    });
    await expect(updateSet(client, { setId: "set1", reps: 12 })).rejects.toThrow(/already performed/);
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("blocks writes past the hourly limit and changes nothing", async () => {
    m.prisma.mcpChange.count.mockResolvedValue(MAX_WRITES_PER_HOUR);
    await expect(updateSession(client, { sessionId: "s1", name: "x" })).rejects.toThrow(/Write limit/);
    expect(m.prisma.workoutSession.findFirst).not.toHaveBeenCalled();
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("records before/after in the same transaction as an edit", async () => {
    m.prisma.workoutSession.findFirst.mockResolvedValue(openSession);
    m.tx.workoutSession.update.mockResolvedValue({ ...openSession, name: "Pull", normalizedName: "pull" });
    const res = await updateSession(client, { sessionId: "s1", name: "Pull" });
    expect(res.changeId).toBe("chg1");
    const logged = m.tx.mcpChange.create.mock.calls[0][0].data;
    expect(logged.before.name).toBe("Push");
    expect(logged.after.name).toBe("Pull");
    expect(logged.userId).toBe("u-client");
  });

  it("refuses to undo when the item changed again afterwards", async () => {
    m.prisma.mcpChange.findFirst.mockResolvedValue({
      id: "chg1",
      tool: "update_session",
      entityId: "s1",
      undoneAt: null,
      before: { name: "Push", normalizedName: "push", notes: null, date: openSession.date.toISOString() },
      after: { name: "Pull", normalizedName: "pull", notes: null, date: openSession.date.toISOString() },
    });
    // Someone edited it by hand to "Legs" after the AI set "Pull".
    m.prisma.workoutSession.findFirst.mockResolvedValue({ ...openSession, name: "Legs", normalizedName: "legs" });
    await expect(undoChange(client, "chg1")).rejects.toThrow(/changed again/);
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("undoes an edit when the item is still as the AI left it", async () => {
    m.prisma.mcpChange.findFirst.mockResolvedValue({
      id: "chg1",
      tool: "update_session",
      entityId: "s1",
      undoneAt: null,
      before: { name: "Push", normalizedName: "push", notes: null, date: openSession.date.toISOString() },
      after: { name: "Pull", normalizedName: "pull", notes: null, date: openSession.date.toISOString() },
    });
    m.prisma.workoutSession.findFirst.mockResolvedValue({ ...openSession, name: "Pull", normalizedName: "pull" });
    const res = await undoChange(client, "chg1");
    expect(res.undone).toBe("chg1");
    expect(m.prisma.workoutSession.update.mock.calls[0][0].data.name).toBe("Push");
  });

  it("cannot undo creations, already-undone changes, or other people's changes", async () => {
    m.prisma.mcpChange.findFirst.mockResolvedValueOnce({
      id: "c2", tool: "create_planned_session", entityId: "s9", undoneAt: null,
    });
    await expect(undoChange(client, "c2")).rejects.toThrow(/can't be undone/);

    m.prisma.mcpChange.findFirst.mockResolvedValueOnce({
      id: "c3", tool: "update_set", entityId: "x", undoneAt: new Date(),
    });
    await expect(undoChange(client, "c3")).rejects.toThrow(/already undone/);

    m.prisma.mcpChange.findFirst.mockResolvedValueOnce(null);
    await expect(undoChange(client, "nope")).rejects.toThrow(/not found/);
    expect(m.prisma.mcpChange.findFirst.mock.calls[2][0].where.userId).toBe("u-client");
  });
});

describe("set_session_warmup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.mcpChange.count.mockResolvedValue(0);
    m.tx.mcpChange.create.mockResolvedValue({ id: "chg-w" });
    m.prisma.workoutSession.findFirst.mockResolvedValue(openSession);
  });

  it("replaces the list, keeps checked-off state for unchanged items, and logs before/after", async () => {
    const doneAt = new Date("2026-10-01T12:05:00.000Z");
    m.tx.sessionWarmupItem.findMany.mockResolvedValue([
      { text: "Incline walk 3 min", doneAt },
      { text: "Old item", doneAt: null },
    ]);
    const res = await setSessionWarmup(client, {
      sessionId: "s1",
      items: ["Incline walk 3 min", "- Hip CARs 3/side"],
    });
    expect(res.warmup).toEqual(["Incline walk 3 min", "Hip CARs 3/side"]);
    expect(m.tx.sessionWarmupItem.deleteMany).toHaveBeenCalledWith({ where: { sessionId: "s1" } });
    expect(m.tx.sessionWarmupItem.createMany.mock.calls[0][0].data).toEqual([
      { sessionId: "s1", text: "Incline walk 3 min", orderIndex: 0, doneAt },
      { sessionId: "s1", text: "Hip CARs 3/side", orderIndex: 1, doneAt: null },
    ]);
    const logged = m.tx.mcpChange.create.mock.calls[0][0].data;
    expect(logged.tool).toBe("set_session_warmup");
    expect(logged.before.items.map((i: { text: string }) => i.text)).toEqual(["Incline walk 3 min", "Old item"]);
  });

  it("is locked on finished workouts", async () => {
    m.prisma.workoutSession.findFirst.mockResolvedValue({ ...openSession, finishedAt: new Date() });
    await expect(setSessionWarmup(client, { sessionId: "s1", items: ["x"] })).rejects.toThrow(/finished/);
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("undo restores the previous list, but refuses if the text changed since", async () => {
    const change = {
      id: "chg-w",
      tool: "set_session_warmup",
      entityId: "s1",
      undoneAt: null,
      before: { items: [{ text: "Bike 5 min", done: false }] },
      after: { items: [{ text: "Walk 3 min", done: false }] },
    };
    m.prisma.mcpChange.findFirst.mockResolvedValue(change);
    // Checked off since the AI edit: still undoable.
    m.prisma.sessionWarmupItem.findMany.mockResolvedValue([{ text: "Walk 3 min", doneAt: new Date() }]);
    const res = await undoChange(client, "chg-w");
    expect(res.restored).toBe("warmup checklist");
    expect(m.prisma.sessionWarmupItem.createMany.mock.calls[0][0].data).toEqual([
      { sessionId: "s1", text: "Bike 5 min", orderIndex: 0, doneAt: null },
    ]);

    vi.clearAllMocks();
    m.prisma.mcpChange.findFirst.mockResolvedValue(change);
    m.prisma.workoutSession.findFirst.mockResolvedValue(openSession);
    m.prisma.sessionWarmupItem.findMany.mockResolvedValue([{ text: "Edited by hand", doneAt: null }]);
    await expect(undoChange(client, "chg-w")).rejects.toThrow(/changed again/);
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("tempo via AI tools", () => {
  const plannedSet = {
    id: "set1",
    weightKg: 50,
    reps: 5,
    plannedWeightKg: 50,
    plannedReps: 5,
    tempo: null,
    completedAt: null,
    exercise: { sessionId: "s1", session: { finishedAt: null } },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.mcpChange.count.mockResolvedValue(0);
    m.tx.mcpChange.create.mockResolvedValue({ id: "chg-t" });
  });

  it("update_set can set tempo alone, normalized", async () => {
    m.prisma.set.findFirst.mockResolvedValue(plannedSet);
    m.tx.set.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...plannedSet, ...data }));
    const res = await updateSet(client, { setId: "set1", tempo: "3/1/x" });
    expect(res.tempo).toBe("3-1-X");
    const logged = m.tx.mcpChange.create.mock.calls[0][0].data;
    expect(logged.before.tempo).toBeNull();
    expect(logged.after.tempo).toBe("3-1-X");
  });

  it("update_set rejects a bad tempo before writing", async () => {
    m.prisma.set.findFirst.mockResolvedValue(plannedSet);
    await expect(updateSet(client, { setId: "set1", tempo: "12-1-1" })).rejects.toThrow(/Invalid tempo/);
    expect(m.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("add_exercise_to_session puts the tempo on each planned set", async () => {
    m.prisma.workoutSession.findFirst.mockResolvedValue(openSession);
    m.tx.exercise.findFirst.mockResolvedValue(null);
    m.tx.exercise.create.mockResolvedValue({ id: "ex1" });
    m.tx.set.create.mockResolvedValue({ id: "new-set" });
    await addExerciseToSession(client, { sessionId: "s1", name: "RDL", sets: 2, weightLb: 135, reps: 8, tempo: "3-1-1" });
    expect(m.tx.set.create.mock.calls.map((c) => (c[0] as { data: { tempo: string } }).data.tempo)).toEqual(["3-1-1", "3-1-1"]);
  });

  it("still undoes set edits recorded before tempo existed", async () => {
    m.prisma.mcpChange.findFirst.mockResolvedValue({
      id: "old",
      tool: "update_set",
      entityId: "set1",
      undoneAt: null,
      before: { weightKg: 45, reps: 5, plannedWeightKg: 45, plannedReps: 5 },
      after: { weightKg: 50, reps: 5, plannedWeightKg: 50, plannedReps: 5 },
    });
    m.prisma.set.findFirst.mockResolvedValue(plannedSet);
    const res = await undoChange(client, "old");
    expect(res.undone).toBe("old");
    expect(m.prisma.set.update.mock.calls[0][0].data.weightKg).toBe(45);
  });
});

import { sameSnapshot } from "./safeguards";
describe("sameSnapshot", () => {
  it("ignores key order (Postgres jsonb reorders keys) but not values", () => {
    expect(sameSnapshot({ a: 1, bb: 2, c: null }, { c: null, a: 1, bb: 2 })).toBe(true);
    expect(sameSnapshot({ a: 1 }, { a: 2 })).toBe(false);
  });
});
