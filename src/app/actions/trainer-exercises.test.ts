import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTrainerId = "trainer-1";
const otherTrainerId = "trainer-2";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/authz", () => ({
  requireTrainer: vi.fn().mockResolvedValue({ id: mockTrainerId }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    trainerExerciseCatalogItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    client: {
      findFirst: vi.fn(),
    },
  },
}));

describe("addTrainerExercise", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireTrainer } = await import("@/lib/authz");
    (requireTrainer as ReturnType<typeof vi.fn>).mockResolvedValue({ id: mockTrainerId });
  });

  it("returns existing item when same normalized name is added twice (no duplicate)", async () => {
    const { addTrainerExercise } = await import("./trainer-exercises");
    const { prisma } = await import("@/lib/db");
    const existingItem = {
      id: "item-1",
      name: "Bench Press",
      isArchived: false,
    };
    (prisma.trainerExerciseCatalogItem.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(existingItem);
    (prisma.trainerExerciseCatalogItem.create as ReturnType<typeof vi.fn>).mockResolvedValue(existingItem);

    const first = await addTrainerExercise("Bench Press");
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.item.name).toBe("Bench Press");

    const second = await addTrainerExercise("bench  press");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.item.id).toBe("item-1");
    expect(prisma.trainerExerciseCatalogItem.create).toHaveBeenCalledTimes(1);
  });
});

describe("archiveTrainerExercise", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireTrainer } = await import("@/lib/authz");
    (requireTrainer as ReturnType<typeof vi.fn>).mockResolvedValue({ id: mockTrainerId });
  });

  it("returns error when item belongs to another trainer", async () => {
    const { archiveTrainerExercise } = await import("./trainer-exercises");
    const { prisma } = await import("@/lib/db");
    (prisma.trainerExerciseCatalogItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await archiveTrainerExercise("item-other-trainer");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not found");
  });
});
