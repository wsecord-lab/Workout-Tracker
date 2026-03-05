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
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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

describe("templates (trainer create)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireTrainer } = await import("@/lib/authz");
    const { prisma } = await import("@/lib/db");
    (requireTrainer as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "trainer-1" });
    (prisma.workoutTemplate.create as ReturnType<typeof vi.fn>).mockImplementation(
      (args: { data: { name: string; items: { create: { orderIndex: number; exerciseName: string; normalizedName: string }[] } } }) => {
        const items = args.data.items.create.map((item: { orderIndex: number; exerciseName: string }, i: number) => ({
          id: `item-${i}`,
          orderIndex: item.orderIndex,
          exerciseName: item.exerciseName,
          normalizedName: item.exerciseName.toLowerCase().replace(/\s+/g, " "),
        }));
        return Promise.resolve({
          id: "tpl-1",
          name: args.data.name,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          items,
        });
      }
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
      expect(result.template.items).toHaveLength(3);
      expect(result.template.items[0].exerciseName).toBe("Bench Press");
      expect(result.template.items[1].exerciseName).toBe("Overhead Press");
      expect(result.template.items[2].exerciseName).toBe("Squat");
    }
    expect(prisma.workoutTemplate.create).toHaveBeenCalledTimes(1);
    const createCall = (prisma.workoutTemplate.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const createdItems = createCall.data.items.create;
    expect(createdItems[0].orderIndex).toBe(0);
    expect(createdItems[1].orderIndex).toBe(1);
    expect(createdItems[2].orderIndex).toBe(2);
    expect(createdItems[0].exerciseName).toBe("Bench Press");
    expect(createdItems[1].exerciseName).toBe("Overhead Press");
    expect(createdItems[2].exerciseName).toBe("Squat");
  });
});
