import { describe, it, expect, vi, beforeEach } from "vitest";

const REDIRECT_THROWN = new Error("NEXT_REDIRECT");

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/authz", () => ({
  assertClientAccess: vi.fn().mockResolvedValue(undefined),
  requireTrainer: vi.fn().mockResolvedValue({ id: "trainer-1", role: "TRAINER" }),
}));
vi.mock("@/lib/db", () => {
  const prisma = {
    client: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    clientWeightRecord: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };
  return { prisma };
});

describe("deleteClient", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { assertClientAccess, requireTrainer } = await import("@/lib/authz");
    const { prisma } = await import("@/lib/db");
    (assertClientAccess as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (requireTrainer as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "trainer-1",
      role: "TRAINER",
    });
    (prisma.client.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "client-1" });
  });

  it("requires trainer before deleting", async () => {
    const { deleteClient } = await import("./clients");
    const { requireTrainer, assertClientAccess } = await import("@/lib/authz");
    const { prisma } = await import("@/lib/db");

    await deleteClient("client-1");

    expect(requireTrainer).toHaveBeenCalledTimes(1);
    expect(assertClientAccess).toHaveBeenCalledWith("client-1");
    expect(prisma.client.delete).toHaveBeenCalledWith({ where: { id: "client-1" } });
  });

  it("does not delete when caller is not a trainer", async () => {
    const { deleteClient } = await import("./clients");
    const { requireTrainer, assertClientAccess } = await import("@/lib/authz");
    const { prisma } = await import("@/lib/db");
    (requireTrainer as ReturnType<typeof vi.fn>).mockRejectedValue(REDIRECT_THROWN);

    await expect(deleteClient("client-1")).rejects.toBe(REDIRECT_THROWN);
    expect(assertClientAccess).not.toHaveBeenCalled();
    expect(prisma.client.delete).not.toHaveBeenCalled();
  });
});

describe("createClient", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireTrainer } = await import("@/lib/authz");
    const { prisma } = await import("@/lib/db");
    (requireTrainer as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "trainer-1",
      role: "TRAINER",
    });
    (prisma.client.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "client-new" });
  });

  it("requires trainer and scopes new client to trainerId", async () => {
    const { createClient } = await import("./clients");
    const { requireTrainer } = await import("@/lib/authz");
    const { prisma } = await import("@/lib/db");

    const formData = new FormData();
    formData.set("name", "Pat");
    formData.set("age", "30");
    formData.set("heightFeet", "5");
    formData.set("heightInInches", "10");
    formData.set("bodyWeightLb", "150");

    const result = await createClient(formData);

    expect(result.ok).toBe(true);
    expect(requireTrainer).toHaveBeenCalledTimes(1);
    expect(prisma.client.create).toHaveBeenCalledTimes(1);
    const createCall = (prisma.client.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.trainerId).toBe("trainer-1");
  });

  it("rejects create when caller is not a trainer", async () => {
    const { createClient } = await import("./clients");
    const { requireTrainer } = await import("@/lib/authz");
    const { prisma } = await import("@/lib/db");
    (requireTrainer as ReturnType<typeof vi.fn>).mockRejectedValue(REDIRECT_THROWN);

    const formData = new FormData();
    formData.set("name", "Pat");
    formData.set("age", "30");
    formData.set("heightFeet", "5");
    formData.set("heightInInches", "10");
    formData.set("bodyWeightLb", "150");

    await expect(createClient(formData)).rejects.toBe(REDIRECT_THROWN);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });
});
