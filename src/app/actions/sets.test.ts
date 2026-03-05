import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Set creation does not overwrite existing sets: createSet must only call prisma.set.create
 * (once per invocation) and must never call prisma.set.deleteMany or replace sets.
 */
const createSetCreate = vi.fn().mockResolvedValue({ id: "set-1" });
const createSetDeleteMany = vi.fn();
const exerciseFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    set: {
      create: (...args: unknown[]) => createSetCreate(...args),
      deleteMany: (...args: unknown[]) => createSetDeleteMany(...args),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    exercise: {
      get findUnique() {
        return exerciseFindUnique;
      },
    },
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
});
