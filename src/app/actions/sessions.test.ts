import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/authz", () => ({
  assertClientAccess: vi.fn().mockResolvedValue(undefined),
  requireTrainer: vi.fn().mockResolvedValue({ id: "trainer-1" }),
}));
vi.mock("@/lib/metrics", () => ({ invalidateClientMetricsCache: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    workoutSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workoutTemplate: {
      findUnique: vi.fn(),
    },
    exercise: {
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

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
});
