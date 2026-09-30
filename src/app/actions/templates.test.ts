import { describe, it, expect, vi, beforeEach } from "vitest";

const REDIRECT_THROWN = Symbol("redirect");

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw REDIRECT_THROWN;
  },
}));
vi.mock("@/lib/authz", () => ({
  requireTrainer: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    workoutTemplate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe("templates (RBAC)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireTrainer } = await import("@/lib/authz");
    (requireTrainer as ReturnType<typeof vi.fn>).mockRejectedValue(REDIRECT_THROWN);
  });

  it("listTemplates returns Forbidden when not trainer (client role)", async () => {
    const { listTemplates } = await import("./templates");
    const result = await listTemplates(false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Forbidden");
    }
  });

  it("createTemplate returns Forbidden when not trainer", async () => {
    const { createTemplate } = await import("./templates");
    const result = await createTemplate({
      name: "Push",
      exerciseNames: ["Bench Press"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors._).toBe("Forbidden");
    }
  });

  it("updateTemplate returns Forbidden when not trainer", async () => {
    const { updateTemplate } = await import("./templates");
    const result = await updateTemplate("tpl-1", { name: "New Name" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors._).toBe("Forbidden");
    }
  });

  it("archiveTemplate returns Forbidden when not trainer", async () => {
    const { archiveTemplate } = await import("./templates");
    const result = await archiveTemplate("tpl-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Forbidden");
    }
  });
});

describe("templates (trainer scope)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireTrainer } = await import("@/lib/authz");
    const { prisma } = await import("@/lib/db");
    (requireTrainer as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "trainer-1" });
    (prisma.workoutTemplate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.workoutTemplate.create as ReturnType<typeof vi.fn>).mockImplementation(
      (args: {
        data: {
          trainerId: string;
          name: string;
          items: {
            create: {
              orderIndex: number;
              exerciseName: string;
              normalizedName: string;
              plannedSetCount: number | null;
              plannedWeightKg: number | null;
              plannedReps: number | null;
            }[];
          };
        };
      }) => {
        const items = args.data.items.create.map((item, i) => ({
          id: `item-${i}`,
          orderIndex: item.orderIndex,
          exerciseName: item.exerciseName,
          normalizedName: item.normalizedName,
          plannedSetCount: item.plannedSetCount,
          plannedWeightKg: item.plannedWeightKg,
          plannedReps: item.plannedReps,
        }));
        return Promise.resolve({
          id: "tpl-1",
          trainerId: args.data.trainerId,
          name: args.data.name,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          items,
        });
      }
    );
  });

  it("listTemplates filters by current trainerId", async () => {
    const { listTemplates } = await import("./templates");
    const { prisma } = await import("@/lib/db");
    await listTemplates(false);
    expect(prisma.workoutTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ trainerId: "trainer-1", isArchived: false }),
      })
    );
  });

  it("trainer can create template with ordered items, order preserved", async () => {
    const { createTemplate } = await import("./templates");
    const { prisma } = await import("@/lib/db");
    const result = await createTemplate({
      name: "Push Day",
      exerciseNames: ["Bench Press", "Overhead Press", "Squat"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.name).toBe("Push Day");
      expect(result.template.trainerId).toBe("trainer-1");
      expect(result.template.items).toHaveLength(3);
      expect(result.template.items[0].exerciseName).toBe("Bench Press");
      expect(result.template.items[1].exerciseName).toBe("Overhead Press");
      expect(result.template.items[2].exerciseName).toBe("Squat");
    }
    expect(prisma.workoutTemplate.create).toHaveBeenCalledTimes(1);
    const createCall = (prisma.workoutTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.trainerId).toBe("trainer-1");
    const createdItems = createCall.data.items.create;
    expect(createdItems[0].orderIndex).toBe(0);
    expect(createdItems[1].orderIndex).toBe(1);
    expect(createdItems[2].orderIndex).toBe(2);
    expect(createdItems[0].exerciseName).toBe("Bench Press");
    expect(createdItems[1].exerciseName).toBe("Overhead Press");
    expect(createdItems[2].exerciseName).toBe("Squat");
  });

  it("createTemplate stores planned sets on items (PlanSetsForm shape)", async () => {
    const { createTemplate } = await import("./templates");
    const { prisma } = await import("@/lib/db");
    const result = await createTemplate({
      name: "Heavy Bench",
      items: [
        {
          exerciseName: "Bench Press",
          orderIndex: 0,
          plannedSetCount: 3,
          plannedWeightLb: 135,
          plannedReps: 5,
        },
      ],
    });
    expect(result.ok).toBe(true);
    const createCall = (prisma.workoutTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const item = createCall.data.items.create[0];
    expect(item.plannedSetCount).toBe(3);
    expect(item.plannedReps).toBe(5);
    expect(item.plannedWeightKg).toBeCloseTo(61.235, 2);
    if (result.ok) {
      expect(result.template.items[0].plannedSetCount).toBe(3);
      expect(result.template.items[0].plannedReps).toBe(5);
    }
  });

  it("updateTemplate / archiveTemplate only touch own trainer templates", async () => {
    const { updateTemplate, archiveTemplate } = await import("./templates");
    const { prisma } = await import("@/lib/db");
    (prisma.workoutTemplate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "tpl-1" });
    (prisma.workoutTemplate.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "tpl-1",
      trainerId: "trainer-1",
      name: "Renamed",
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    });
    (prisma.workoutTemplate.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await updateTemplate("tpl-1", { name: "Renamed" });
    expect(prisma.workoutTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: "tpl-1", trainerId: "trainer-1" },
      select: { id: true },
    });

    await archiveTemplate("tpl-1");
    expect(prisma.workoutTemplate.updateMany).toHaveBeenCalledWith({
      where: { id: "tpl-1", trainerId: "trainer-1" },
      data: { isArchived: true },
    });
  });

  it("archiveTemplate returns not found when template belongs to another trainer", async () => {
    const { archiveTemplate } = await import("./templates");
    const { prisma } = await import("@/lib/db");
    (prisma.workoutTemplate.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
    const result = await archiveTemplate("other-tpl");
    expect(result).toEqual({ ok: false, error: "Template not found" });
  });
});
