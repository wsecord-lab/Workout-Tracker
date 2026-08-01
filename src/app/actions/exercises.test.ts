import { describe, it, expect, vi, beforeEach } from "vitest";

const exerciseCreate = vi.fn().mockResolvedValue({ id: "ex-new" });
const exerciseAggregate = vi.fn();
const exerciseUpdate = vi.fn((args: unknown) => args);
const sessionFindUnique = vi.fn();
const catalogFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    exercise: {
      create: (...args: unknown[]) => exerciseCreate(...args),
      aggregate: (...args: unknown[]) => exerciseAggregate(...args),
      update: (...args: unknown[]) => exerciseUpdate(args[0]),
      findUnique: vi.fn(),
    },
    workoutSession: {
      get findUnique() {
        return sessionFindUnique;
      },
    },
    exerciseCatalog: {
      get findUnique() {
        return catalogFindUnique;
      },
      upsert: vi.fn(),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/lib/authz", () => ({
  assertClientAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/metrics", () => ({
  invalidateClientMetricsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/revalidate-client", () => ({
  revalidateClientWorkoutViews: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  exerciseCreate.mockResolvedValue({ id: "ex-new" });
  sessionFindUnique.mockResolvedValue({
    id: "sess-1",
    clientId: "client-1",
    client: { id: "client-1" },
  });
  catalogFindUnique.mockResolvedValue({ name: "Bench Press" });
  exerciseAggregate.mockResolvedValue({ _max: { orderIndex: 2 } });
});

describe("createExercise", () => {
  it("assigns orderIndex max+1 when adding from the catalog", async () => {
    const { createExercise } = await import("./exercises");

    await createExercise("sess-1", "ignored", "cat-1");

    // Previously omitted entirely, so every manually added exercise sat at 0
    // and the session's display order was whatever Postgres returned.
    expect(exerciseCreate.mock.calls[0][0].data.orderIndex).toBe(3);
  });

  it("assigns orderIndex max+1 when adding a free-text exercise", async () => {
    const { createExercise } = await import("./exercises");

    await createExercise("sess-1", "Zercher Squat", null);

    expect(exerciseCreate.mock.calls[0][0].data.orderIndex).toBe(3);
  });

  it("starts at 0 for the first exercise in a session", async () => {
    exerciseAggregate.mockResolvedValue({ _max: { orderIndex: null } });
    const { createExercise } = await import("./exercises");

    await createExercise("sess-1", "Squat", null);

    expect(exerciseCreate.mock.calls[0][0].data.orderIndex).toBe(0);
  });

  it("counts soft-deleted exercises so a restore cannot collide", async () => {
    const { createExercise } = await import("./exercises");
    await createExercise("sess-1", "Squat", null);

    // No deletedAt filter — the aggregate spans every row for the session.
    expect(exerciseAggregate.mock.calls[0][0].where).toEqual({ sessionId: "sess-1" });
  });
});

describe("reorderExercises", () => {
  beforeEach(() => {
    sessionFindUnique.mockResolvedValue({
      clientId: "client-1",
      exercises: [{ id: "e1" }, { id: "e2" }, { id: "e3" }],
    });
  });

  it("writes 0..n-1 in the given order", async () => {
    const { reorderExercises } = await import("./exercises");

    const result = await reorderExercises("sess-1", ["e2", "e3", "e1"]);

    expect(result).toEqual({ ok: true });
    expect(exerciseUpdate.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: "e2" }, data: { orderIndex: 0 } },
      { where: { id: "e3" }, data: { orderIndex: 1 } },
      { where: { id: "e1" }, data: { orderIndex: 2 } },
    ]);
  });

  it("only considers live exercises", async () => {
    const { reorderExercises } = await import("./exercises");
    await reorderExercises("sess-1", ["e1", "e2", "e3"]);

    expect(sessionFindUnique.mock.calls[0][0].select.exercises.where).toEqual({ deletedAt: null });
  });

  it("rejects a stale list", async () => {
    const { reorderExercises } = await import("./exercises");
    const result = await reorderExercises("sess-1", ["e1", "e2"]);
    expect(result).toEqual({ ok: false, error: "Exercise list does not match this session" });
    expect(exerciseUpdate).not.toHaveBeenCalled();
  });

  it("rejects an id from another session", async () => {
    const { reorderExercises } = await import("./exercises");
    const result = await reorderExercises("sess-1", ["e1", "e2", "someone-elses-exercise"]);
    expect(result).toEqual({ ok: false, error: "Exercise list does not match this session" });
    expect(exerciseUpdate).not.toHaveBeenCalled();
  });

  it("rejects duplicate ids", async () => {
    const { reorderExercises } = await import("./exercises");
    const result = await reorderExercises("sess-1", ["e1", "e1", "e2"]);
    expect(result).toEqual({ ok: false, error: "Exercise list does not match this session" });
    expect(exerciseUpdate).not.toHaveBeenCalled();
  });
});
