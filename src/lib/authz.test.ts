import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * RBAC tests: trainer cannot access another trainer's client; client cannot access other clients.
 * We test the logic by mocking auth and prisma; assertTrainerOwnsClient and assertClientAccess
 * call redirect() on failure, so we mock redirect to throw a symbol and assert it's thrown.
 */
const REDIRECT_THROWN = Symbol("redirect");

vi.mock("next/navigation", () => ({
  redirect: () => {
    throw REDIRECT_THROWN;
  },
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    client: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

async function loadAuthz() {
  const { assertTrainerOwnsClient, assertClientAccess, requireUser } = await import("./authz");
  const { auth } = await import("@/auth");
  const { prisma } = await import("@/lib/db");
  return { assertTrainerOwnsClient, assertClientAccess, requireUser, auth, prisma };
}

describe("assertTrainerOwnsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not redirect when trainer owns client (trainerId matches)", async () => {
    const { assertTrainerOwnsClient, auth, prisma } = await loadAuthz();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "trainer-1", role: "TRAINER" },
    });
    (prisma.client.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      trainerId: "trainer-1",
    });
    await expect(assertTrainerOwnsClient("client-1")).resolves.not.toThrow();
  });

  it("redirects when trainer does not own client (trainerId differs)", async () => {
    const { assertTrainerOwnsClient, auth, prisma } = await loadAuthz();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "trainer-2", role: "TRAINER" },
    });
    (prisma.client.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      trainerId: "trainer-1",
    });
    await expect(assertTrainerOwnsClient("client-1")).rejects.toBe(REDIRECT_THROWN);
  });

  it("redirects when the client has no trainer assigned", async () => {
    const { assertTrainerOwnsClient, auth, prisma } = await loadAuthz();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "trainer-1", role: "TRAINER" },
    });
    (prisma.client.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      trainerId: null,
    });
    await expect(assertTrainerOwnsClient("client-1")).rejects.toBe(REDIRECT_THROWN);
  });
});

describe("assertClientAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects when CLIENT user accesses another client's data", async () => {
    const { assertClientAccess, auth, prisma } = await loadAuthz();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-client-A", role: "CLIENT" },
    });
    (prisma.client.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: "user-client-B",
    });
    await expect(assertClientAccess("client-1")).rejects.toBe(REDIRECT_THROWN);
  });

  it("does not redirect when CLIENT user accesses own client", async () => {
    const { assertClientAccess, auth, prisma } = await loadAuthz();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-client-A", role: "CLIENT" },
    });
    (prisma.client.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ userId: "user-client-A" })
      .mockResolvedValueOnce({ userId: "user-client-A" });
    await expect(assertClientAccess("client-1")).resolves.not.toThrow();
  });
});

describe("requireUser mustChangePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to change-password when mustChangePassword is set", async () => {
    const { requireUser, auth } = await loadAuthz();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u1", role: "CLIENT", mustChangePassword: true },
    });
    await expect(requireUser()).rejects.toBe(REDIRECT_THROWN);
  });

  it("allows access when allowPasswordChange is true", async () => {
    const { requireUser, auth } = await loadAuthz();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u1", role: "CLIENT", mustChangePassword: true },
    });
    await expect(requireUser({ allowPasswordChange: true })).resolves.toMatchObject({
      id: "u1",
      mustChangePassword: true,
    });
  });

  it("does not redirect when mustChangePassword is false", async () => {
    const { requireUser, auth } = await loadAuthz();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u1", role: "CLIENT", mustChangePassword: false },
    });
    await expect(requireUser()).resolves.toMatchObject({ id: "u1" });
  });
});
