import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Set creation does not overwrite existing sets: createSet must only call prisma.set.create
 * (once per invocation) and must never call prisma.set.deleteMany or replace sets.
 */
const createSetCreate = vi.fn().mockResolvedValue({ id: "set-1" });
const createSetDeleteMany = vi.fn();
const exerciseFindUnique = vi.fn();
type UpdateArgs = { where: { id: string }; data: Record<string, unknown> };
const setUpdate = vi.fn((args: UpdateArgs) => args);
const setUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const setCreateMany = vi.fn().mockResolvedValue({ count: 0 });
const setFindUnique = vi.fn();
const workoutSessionFindUnique = vi.fn();
const transaction = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/db", () => ({
  prisma: {
    set: {
      create: (...args: unknown[]) => createSetCreate(...args),
      createMany: (...args: unknown[]) => setCreateMany(...args),
      deleteMany: (...args: unknown[]) => createSetDeleteMany(...args),
      updateMany: (...args: unknown[]) => setUpdateMany(...args),
      update: (...args: unknown[]) => setUpdate(args[0] as UpdateArgs),
      get findUnique() {
        return setFindUnique;
      },
    },
    exercise: {
      get findUnique() {
        return exerciseFindUnique;
      },
    },
    workoutSession: {
      get findUnique() {
        return workoutSessionFindUnique;
      },
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));
vi.mock("@/lib/authz", () => ({
  assertClientAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/metrics", () => ({
  invalidateClientMetricsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  createSetCreate.mockResolvedValue({ id: "set-1" });
  exerciseFindUnique.mockResolvedValue({
    id: "ex-1",
    session: { clientId: "client-1" },
    sets: [{ orderIndex: 0 }, { orderIndex: 1 }],
  });
});

describe("createSet", () => {
  it("calls prisma.set.create once and never deleteMany", async () => {
    const { createSet } = await import("./sets");
    const form = new FormData();
    form.set("weightLb", "135");
    form.set("reps", "5");
    form.set("rpe", "8");
    form.set("notes", "Good set");

    const result = await createSet("ex-1", form);

    expect(result).toEqual({ ok: true });
    expect(createSetCreate).toHaveBeenCalledTimes(1);
    expect(createSetDeleteMany).not.toHaveBeenCalled();
  });

  it("appends after the highest existing orderIndex", async () => {
    const { createSet } = await import("./sets");
    const form = new FormData();
    form.set("weightLb", "135");
    form.set("reps", "5");

    await createSet("ex-1", form);

    expect(createSetCreate.mock.calls[0][0].data.orderIndex).toBe(2);
  });

  it("stamps completedAt: a live-logged set is completed by definition", async () => {
    const { createSet } = await import("./sets");
    const form = new FormData();
    form.set("weightLb", "135");
    form.set("reps", "5");

    await createSet("ex-1", form);

    // Without this, the set is invisible to charts, metrics, and Whoop export.
    expect(createSetCreate.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
  });
});

describe("createSetsBulk", () => {
  function bulkForm(rows: { weight: string; reps: string }[]) {
    const form = new FormData();
    form.set("exerciseId", "ex-1");
    form.set("setsJson", JSON.stringify(rows));
    return form;
  }

  it("assigns sequential orderIndex continuing from the existing max", async () => {
    const { createSetsBulk } = await import("./sets");

    // Exercise already has sets at 0 and 1.
    const result = await createSetsBulk(
      bulkForm([
        { weight: "135", reps: "5" },
        { weight: "145", reps: "5" },
        { weight: "155", reps: "5" },
      ])
    );

    expect(result).toEqual({ ok: true });
    // Previously all three landed at orderIndex 0 and sorted arbitrarily.
    const indices = createSetCreate.mock.calls.map((c) => c[0].data.orderIndex);
    expect(indices).toEqual([2, 3, 4]);
  });

  it("stamps completedAt on every bulk-added set", async () => {
    const { createSetsBulk } = await import("./sets");
    await createSetsBulk(bulkForm([{ weight: "135", reps: "5" }, { weight: "145", reps: "5" }]));
    for (const call of createSetCreate.mock.calls) {
      expect(call[0].data.completedAt).toBeInstanceOf(Date);
    }
  });
});

describe("reorderSets", () => {
  beforeEach(() => {
    exerciseFindUnique.mockResolvedValue({
      id: "ex-1",
      session: { clientId: "client-1" },
      sets: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
    });
  });

  it("writes 0..n-1 in the given order", async () => {
    const { reorderSets } = await import("./sets");

    const result = await reorderSets("ex-1", ["s3", "s1", "s2"]);

    expect(result).toEqual({ ok: true });
    expect(setUpdate.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: "s3" }, data: { orderIndex: 0 } },
      { where: { id: "s1" }, data: { orderIndex: 1 } },
      { where: { id: "s2" }, data: { orderIndex: 2 } },
    ]);
  });

  it("rejects a list that is missing a set (stale client)", async () => {
    const { reorderSets } = await import("./sets");
    const result = await reorderSets("ex-1", ["s1", "s2"]);
    expect(result).toEqual({ ok: false, error: "Set list does not match this exercise" });
    expect(setUpdate).not.toHaveBeenCalled();
  });

  it("rejects duplicate ids", async () => {
    const { reorderSets } = await import("./sets");
    const result = await reorderSets("ex-1", ["s1", "s1", "s2"]);
    expect(result).toEqual({ ok: false, error: "Set list does not match this exercise" });
    expect(setUpdate).not.toHaveBeenCalled();
  });

  it("rejects an id belonging to a different exercise", async () => {
    const { reorderSets } = await import("./sets");

    // assertClientAccess only authorizes the *exercise*. Without the set-equality
    // check, this would renumber another client's set.
    const result = await reorderSets("ex-1", ["s1", "s2", "someone-elses-set"]);

    expect(result).toEqual({ ok: false, error: "Set list does not match this exercise" });
    expect(setUpdate).not.toHaveBeenCalled();
  });

  it("returns an error for a missing exercise", async () => {
    exerciseFindUnique.mockResolvedValue(null);
    const { reorderSets } = await import("./sets");
    expect(await reorderSets("nope", ["s1"])).toEqual({ ok: false, error: "Exercise not found" });
  });
});

describe("createPlannedSets", () => {
  it("writes the target to both the live values and the plan snapshot, uncompleted", async () => {
    const { createPlannedSets } = await import("./sets");
    const form = new FormData();
    form.set("exerciseId", "ex-1");
    form.set("setsJson", JSON.stringify([{ weight: "185", reps: "5" }, { weight: "185", reps: "5" }]));

    const result = await createPlannedSets(form);

    expect(result).toEqual({ ok: true });
    const rows = setCreateMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      // weightKg/reps hold the target so every display path reads it plainly;
      // planned* preserves it once an actual overwrites weightKg/reps.
      expect(row.plannedWeightKg).toBe(row.weightKg);
      expect(row.plannedReps).toBe(row.reps);
      expect(row.completedAt).toBeNull();
    }
    expect(rows.map((r: { orderIndex: number }) => r.orderIndex)).toEqual([2, 3]);
  });
});

describe("completeSet", () => {
  const planned = {
    id: "s1",
    weightKg: 83.9,
    reps: 5,
    plannedWeightKg: 83.9,
    plannedReps: 5,
    completedAt: null,
    exercise: { session: { clientId: "client-1" } },
  };

  it("with no override, the actual stays at the planned values", async () => {
    setFindUnique.mockResolvedValue(planned);
    const { completeSet } = await import("./sets");

    expect(await completeSet("s1")).toEqual({ ok: true });

    const data = setUpdate.mock.calls[0][0].data;
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(data.weightKg).toBeUndefined(); // untouched
    expect(data.plannedWeightKg).toBe(83.9);
  });

  it("with an override, stores the actual and keeps the plan snapshot", async () => {
    setFindUnique.mockResolvedValue(planned);
    const { completeSet } = await import("./sets");
    const form = new FormData();
    form.set("weightLb", "175");
    form.set("reps", "5");

    await completeSet("s1", form);

    const data = setUpdate.mock.calls[0][0].data;
    expect(data.plannedWeightKg).toBe(83.9); // planned 185 lb
    expect(data.weightKg).toBeCloseTo(79.38, 1); // did 175 lb
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it("is idempotent — re-completing does not move completedAt", async () => {
    const already = new Date("2026-07-01T12:00:00Z");
    setFindUnique.mockResolvedValue({ ...planned, completedAt: already });
    const { completeSet } = await import("./sets");

    await completeSet("s1");

    expect(setUpdate.mock.calls[0][0].data.completedAt).toBe(already);
  });
});

describe("uncompleteSet", () => {
  it("reverts the actual back to the plan", async () => {
    setFindUnique.mockResolvedValue({
      id: "s1",
      weightKg: 79.38,
      reps: 4,
      plannedWeightKg: 83.9,
      plannedReps: 5,
      completedAt: new Date(),
      exercise: { session: { clientId: "client-1" } },
    });
    const { uncompleteSet } = await import("./sets");

    await uncompleteSet("s1");

    expect(setUpdate.mock.calls[0][0].data).toMatchObject({
      completedAt: null,
      weightKg: 83.9,
      reps: 5,
    });
  });

  it("leaves the numbers alone for an ad-hoc set that was never planned", async () => {
    setFindUnique.mockResolvedValue({
      id: "s1",
      weightKg: 79.38,
      reps: 4,
      plannedWeightKg: null,
      plannedReps: null,
      completedAt: new Date(),
      exercise: { session: { clientId: "client-1" } },
    });
    const { uncompleteSet } = await import("./sets");

    await uncompleteSet("s1");

    expect(setUpdate.mock.calls[0][0].data).toEqual({ completedAt: null });
  });
});

describe("syncCheckedSets", () => {
  it("only completes sets in this session that are still incomplete", async () => {
    workoutSessionFindUnique.mockResolvedValue({ clientId: "client-1", finishedAt: null });
    setUpdateMany.mockResolvedValue({ count: 2 });
    const { syncCheckedSets } = await import("./sets");

    const result = await syncCheckedSets("sess-1", ["s1", "s2"]);

    expect(result).toEqual({ ok: true, migrated: 2 });
    expect(setUpdateMany.mock.calls[0][0].where).toMatchObject({
      id: { in: ["s1", "s2"] },
      completedAt: null,
      exercise: { sessionId: "sess-1", deletedAt: null },
    });
  });

  it("no-ops on a finished session so a stale key can't resurrect checks", async () => {
    workoutSessionFindUnique.mockResolvedValue({ clientId: "client-1", finishedAt: new Date() });
    const { syncCheckedSets } = await import("./sets");

    expect(await syncCheckedSets("sess-1", ["s1"])).toEqual({ ok: true, migrated: 0 });
    expect(setUpdateMany).not.toHaveBeenCalled();
  });

  it("short-circuits on an empty list", async () => {
    const { syncCheckedSets } = await import("./sets");
    expect(await syncCheckedSets("sess-1", [])).toEqual({ ok: true, migrated: 0 });
    expect(workoutSessionFindUnique).not.toHaveBeenCalled();
  });
});

describe("updateSet", () => {
  it("moves the plan snapshot when editing a set that hasn't been performed", async () => {
    setFindUnique.mockResolvedValue({
      id: "s1",
      completedAt: null,
      exercise: { session: { clientId: "client-1" } },
    });
    const { updateSet } = await import("./sets");
    const form = new FormData();
    form.set("weightLb", "195");
    form.set("reps", "5");

    await updateSet("s1", form);

    const data = setUpdate.mock.calls[0][0].data;
    expect(data.plannedWeightKg).toBe(data.weightKg);
    expect(data.plannedReps).toBe(5);
  });

  it("leaves the plan snapshot alone when editing a completed set", async () => {
    setFindUnique.mockResolvedValue({
      id: "s1",
      completedAt: new Date(),
      plannedWeightKg: 83.9,
      plannedReps: 5,
      exercise: { session: { clientId: "client-1" } },
    });
    const { updateSet } = await import("./sets");
    const form = new FormData();
    form.set("weightLb", "175");
    form.set("reps", "4");

    await updateSet("s1", form);

    const data = setUpdate.mock.calls[0][0].data;
    expect(data.plannedWeightKg).toBeUndefined();
    expect(data.plannedReps).toBeUndefined();
  });
});
