import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/authz", () => ({
  assertClientAccess: vi.fn().mockResolvedValue(undefined),
  requireTrainer: vi.fn().mockResolvedValue({ id: "trainer-1" }),
}));
vi.mock("@/lib/metrics", () => ({ invalidateClientMetricsCache: vi.fn() }));
vi.mock("@/lib/revalidate-client", () => ({ revalidateClientWorkoutViews: vi.fn() }));
vi.mock("@/lib/db/session-history", () => ({
  getDurationStatsForName: vi.fn().mockResolvedValue({ averageSeconds: null, sampleCount: 0 }),
  findLastSessionWithSameName: vi.fn(),
  listRecentDistinctSessionNames: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db", () => {
  const prisma = {
    workoutSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workoutTemplate: {
      findUnique: vi.fn(),
    },
    exercise: {
      create: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
    set: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return { prisma };
});

describe("createSessionWithTemplate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { assertClientAccess, requireTrainer } = await import("@/lib/authz");
    const { prisma } = await import("@/lib/db");
    (assertClientAccess as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (requireTrainer as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "trainer-1" });
    (prisma.workoutSession.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "session-new",
      clientId: "client-1",
    });
    (prisma.workoutTemplate.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tpl-1",
      isArchived: false,
      items: [
        { orderIndex: 0, exerciseName: "Bench Press", normalizedName: "bench press" },
        { orderIndex: 1, exerciseName: "Squat", normalizedName: "squat" },
      ],
    });
    (prisma.exercise.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });
  });

  it("applying template creates correct number and order of exercises in session", async () => {
    const { createSessionWithTemplate } = await import("./sessions");
    const { prisma } = await import("@/lib/db");

    const result = await createSessionWithTemplate("client-1", "Push", "tpl-1");
    expect(result.ok).toBe(true);

    expect(prisma.workoutSession.create).toHaveBeenCalledTimes(1);
    expect(prisma.exercise.createMany).toHaveBeenCalledTimes(1);
    const createManyCall = (prisma.exercise.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createManyCall.data).toHaveLength(2);
    expect(createManyCall.data[0]).toMatchObject({
      sessionId: "session-new",
      name: "Bench Press",
      orderIndex: 0,
    });
    expect(createManyCall.data[1]).toMatchObject({
      sessionId: "session-new",
      name: "Squat",
      orderIndex: 1,
    });
  });

  it("includes calendar date on session when calendarDateKey is provided", async () => {
    const { createSessionWithTemplate } = await import("./sessions");
    const { prisma } = await import("@/lib/db");

    const result = await createSessionWithTemplate("client-1", "Legs", "tpl-1", "2026-05-08");
    expect(result.ok).toBe(true);

    const createCall = (prisma.workoutSession.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.clientId).toBe("client-1");
    expect(createCall.data.name).toBe("Legs");
    expect(createCall.data.date).toBeInstanceOf(Date);
    expect(createCall.data.date.getFullYear()).toBe(2026);
    expect(createCall.data.date.getMonth()).toBe(4);
    expect(createCall.data.date.getDate()).toBe(8);
  });

  it("stores normalizedName so 'copy last Legs workout' can find it", async () => {
    const { createSessionWithTemplate } = await import("./sessions");
    const { prisma } = await import("@/lib/db");

    await createSessionWithTemplate("client-1", "  Upper   BODY ", "tpl-1");

    const createCall = (prisma.workoutSession.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.normalizedName).toBe("upper body");
  });
});

describe("createSession", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/db");
    (prisma.workoutSession.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s1" });
  });

  it("stores normalizedName alongside name", async () => {
    const { createSession } = await import("./sessions");
    const { prisma } = await import("@/lib/db");

    await createSession("client-1", "Push Day");

    const call = (prisma.workoutSession.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.normalizedName).toBe("push day");
  });

  it("leaves normalizedName null for an unnamed session", async () => {
    const { createSession } = await import("./sessions");
    const { prisma } = await import("@/lib/db");

    await createSession("client-1", null);

    const call = (prisma.workoutSession.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.normalizedName).toBeNull();
  });
});

describe("updateSessionName", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps normalizedName in lockstep on rename", async () => {
    const { updateSessionName } = await import("./sessions");
    const { prisma } = await import("@/lib/db");

    await updateSessionName("s1", "client-1", "Lower Body");

    const call = (prisma.workoutSession.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data).toMatchObject({ name: "Lower Body", normalizedName: "lower body" });
  });
});

describe("startSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stamps startedAt on a fresh session", async () => {
    const { startSession } = await import("./sessions");
    const { prisma } = await import("@/lib/db");
    (prisma.workoutSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      startedAt: null,
      clientId: "client-1",
    });

    const result = await startSession("s1", "client-1");

    expect(result.ok).toBe(true);
    expect(prisma.workoutSession.update).toHaveBeenCalledTimes(1);
    const call = (prisma.workoutSession.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.startedAt).toBeInstanceOf(Date);
  });

  it("is idempotent: resuming a workout does not restart the clock", async () => {
    const { startSession } = await import("./sessions");
    const { prisma } = await import("@/lib/db");
    const existing = new Date("2026-07-01T10:00:00Z");
    (prisma.workoutSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      startedAt: existing,
      clientId: "client-1",
    });

    const result = await startSession("s1", "client-1");

    expect(result).toEqual({ ok: true, startedAt: existing.toISOString() });
    expect(prisma.workoutSession.update).not.toHaveBeenCalled();
  });

  it("refuses a session belonging to another client", async () => {
    const { startSession } = await import("./sessions");
    const { prisma } = await import("@/lib/db");
    (prisma.workoutSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      startedAt: null,
      clientId: "other-client",
    });

    expect(await startSession("s1", "client-1")).toEqual({ ok: false, error: "Session not found" });
    expect(prisma.workoutSession.update).not.toHaveBeenCalled();
  });
});

describe("markSessionFinished", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not fabricate a startedAt, which would render a false 0 min", async () => {
    const { markSessionFinished } = await import("./sessions");
    const { prisma } = await import("@/lib/db");

    await markSessionFinished("s1", "client-1");

    const call = (prisma.workoutSession.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data).toEqual({ finishedAt: expect.any(Date) });
  });
});

describe("repeatLastWorkout", () => {
  const done = new Date("2026-06-01T12:00:00Z");

  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/db");
    // Run the interactive transaction against the same mocked client.
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (tx: unknown) => unknown) => cb(prisma)
    );
    (prisma.workoutSession.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "new-session" });
    (prisma.exercise.create as ReturnType<typeof vi.fn>).mockImplementation(
      ({ data }: { data: { name: string } }) => Promise.resolve({ id: `ex-${data.name}` })
    );
  });

  function sourceSession(overrides: Record<string, unknown> = {}) {
    return {
      id: "src-1",
      clientId: "client-1",
      name: "Upper Body",
      exercises: [
        {
          name: "Bench Press",
          catalogExerciseId: "cat-1",
          groupId: null,
          sets: [
            { weightKg: 83.9, reps: 5, rpe: 9, notes: "grindy", completedAt: done },
            { weightKg: 83.9, reps: 4, rpe: 9.5, notes: null, completedAt: done },
          ],
        },
      ],
      ...overrides,
    };
  }

  it("copies last time's sets in as planned targets, not as completed work", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.workoutSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sourceSession());
    const { repeatLastWorkout } = await import("./sessions");

    const result = await repeatLastWorkout("client-1", { sourceSessionId: "src-1" });

    expect(result).toEqual({ ok: true, sessionId: "new-session" });
    const sets = (prisma.set.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(sets).toHaveLength(2);
    for (const s of sets) {
      expect(s.completedAt).toBeNull();
      expect(s.plannedWeightKg).toBe(s.weightKg);
      expect(s.plannedReps).toBe(s.reps);
    }
    expect(sets.map((s: { orderIndex: number }) => s.orderIndex)).toEqual([0, 1]);
  });

  it("does not carry over RPE or notes — a plan is a target, not last week's effort", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.workoutSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sourceSession());
    const { repeatLastWorkout } = await import("./sessions");

    await repeatLastWorkout("client-1", { sourceSessionId: "src-1" });

    const sets = (prisma.set.createMany as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    for (const s of sets) {
      expect(s.rpe).toBeUndefined();
      expect(s.notes).toBeUndefined();
    }
  });

  it("gives exercises dense order indices and stores normalizedName", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.workoutSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      sourceSession({
        exercises: [
          { name: "A", catalogExerciseId: null, groupId: null, sets: [] },
          { name: "B", catalogExerciseId: null, groupId: null, sets: [] },
          { name: "C", catalogExerciseId: null, groupId: null, sets: [] },
        ],
      })
    );
    const { repeatLastWorkout } = await import("./sessions");

    await repeatLastWorkout("client-1", { sourceSessionId: "src-1" });

    const created = (prisma.exercise.create as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].data);
    expect(created.map((d) => d.orderIndex)).toEqual([0, 1, 2]);
    const sessionCall = (prisma.workoutSession.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sessionCall.data.normalizedName).toBe("upper body");
  });

  it("re-mints group ids consistently so a superset stays a superset", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.workoutSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      sourceSession({
        exercises: [
          { name: "A", catalogExerciseId: null, groupId: "grp_old", sets: [] },
          { name: "B", catalogExerciseId: null, groupId: "grp_old", sets: [] },
          { name: "C", catalogExerciseId: null, groupId: null, sets: [] },
        ],
      })
    );
    const { repeatLastWorkout } = await import("./sessions");

    await repeatLastWorkout("client-1", { sourceSessionId: "src-1" });

    const created = (prisma.exercise.create as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].data);
    expect(created[0].groupId).toBe(created[1].groupId);
    // Group ids are globally unique, so the copy must not reuse the source's.
    expect(created[0].groupId).not.toBe("grp_old");
    expect(created[0].groupId).toMatch(/^grp_[0-9a-f]{16}$/);
    expect(created[2].groupId).toBeNull();
  });

  it("refuses a source belonging to another client", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.workoutSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      sourceSession({ clientId: "someone-else" })
    );
    const { repeatLastWorkout } = await import("./sessions");

    const result = await repeatLastWorkout("client-1", { sourceSessionId: "src-1" });
    expect(result).toEqual({ ok: false, error: "No previous workout found to copy." });
    expect(prisma.workoutSession.create).not.toHaveBeenCalled();
  });

  it("refuses a source with nothing to copy", async () => {
    const { prisma } = await import("@/lib/db");
    (prisma.workoutSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      sourceSession({ exercises: [] })
    );
    const { repeatLastWorkout } = await import("./sessions");

    expect(await repeatLastWorkout("client-1", { sourceSessionId: "src-1" })).toEqual({
      ok: false,
      error: "That workout has nothing to copy.",
    });
  });

  it("falls back to name matching when no source id is given", async () => {
    const { findLastSessionWithSameName } = await import("@/lib/db/session-history");
    (findLastSessionWithSameName as ReturnType<typeof vi.fn>).mockResolvedValue(sourceSession());
    const { repeatLastWorkout } = await import("./sessions");

    await repeatLastWorkout("client-1", { name: "Upper Body" });

    expect(findLastSessionWithSameName).toHaveBeenCalledWith({
      clientId: "client-1",
      normalizedName: "upper body",
    });
  });

  it("reports cleanly when no prior workout of that name exists", async () => {
    const { findLastSessionWithSameName } = await import("@/lib/db/session-history");
    (findLastSessionWithSameName as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { repeatLastWorkout } = await import("./sessions");

    expect(await repeatLastWorkout("client-1", { name: "Never Done" })).toEqual({
      ok: false,
      error: "No previous workout found to copy.",
    });
  });
});

describe("updateSessionDuration", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/db");
    (prisma.workoutSession.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      clientId: "client-1",
    });
  });

  it("stores minutes as seconds", async () => {
    const { updateSessionDuration } = await import("./sessions");
    const { prisma } = await import("@/lib/db");

    expect(await updateSessionDuration("s1", "client-1", 52)).toEqual({ ok: true });
    const call = (prisma.workoutSession.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.durationSeconds).toBe(3120);
  });

  it("null clears the override and returns to auto", async () => {
    const { updateSessionDuration } = await import("./sessions");
    const { prisma } = await import("@/lib/db");

    await updateSessionDuration("s1", "client-1", null);
    const call = (prisma.workoutSession.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.durationSeconds).toBeNull();
  });

  it("rejects out-of-range and non-integer values", async () => {
    const { updateSessionDuration } = await import("./sessions");
    const { prisma } = await import("@/lib/db");

    for (const bad of [0, -5, 1441, 52.5]) {
      const result = await updateSessionDuration("s1", "client-1", bad);
      expect(result.ok).toBe(false);
    }
    expect(prisma.workoutSession.update).not.toHaveBeenCalled();
  });
});
