import { describe, it, expect, vi, beforeEach } from "vitest";

const userFindUnique = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();
const clientFindFirst = vi.fn();
const clientFindUnique = vi.fn();
const clientCreate = vi.fn();
const clientUpdate = vi.fn();
const passwordResetTokenFindUnique = vi.fn();
const passwordResetTokenCreate = vi.fn();
const passwordResetTokenUpdate = vi.fn();
const transaction = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/authz", () => ({
  requireTrainer: vi.fn().mockResolvedValue({ id: "trainer-1", role: "TRAINER" }),
}));
vi.mock("@/lib/passwords", () => ({
  hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
  verifyPassword: vi.fn(async (plain: string, hash: string) => hash === `hashed:${plain}`),
  validateNewPassword: vi.fn((p: string) =>
    typeof p === "string" && p.length >= 8 ? null : "Password must be at least 8 characters"
  ),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      get findUnique() {
        return userFindUnique;
      },
      get create() {
        return userCreate;
      },
      get update() {
        return userUpdate;
      },
      delete: vi.fn(),
    },
    client: {
      get findFirst() {
        return clientFindFirst;
      },
      get findUnique() {
        return clientFindUnique;
      },
      get create() {
        return clientCreate;
      },
      get update() {
        return clientUpdate;
      },
      findMany: vi.fn(),
    },
    passwordResetToken: {
      get findUnique() {
        return passwordResetTokenFindUnique;
      },
      get create() {
        return passwordResetTokenCreate;
      },
      get update() {
        return passwordResetTokenUpdate;
      },
    },
    get $transaction() {
      return transaction;
    },
  },
}));

async function loadAccounts() {
  const accounts = await import("./accounts");
  const { auth } = await import("@/auth");
  return { ...accounts, auth };
}

function trainerSession() {
  return {
    user: { id: "trainer-1", role: "TRAINER", email: "trainer@test.com" },
  };
}

function clientSession(id = "client-user-1") {
  return {
    user: { id, role: "CLIENT", email: "client@test.com" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation(async (ops: unknown) => {
    if (Array.isArray(ops)) return Promise.all(ops);
    return ops;
  });
});

describe("createClientLoginAndLink", () => {
  it("creates a CLIENT user with mustChangePassword true", async () => {
    const { createClientLoginAndLink, auth } = await loadAccounts();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(trainerSession());
    userFindUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({
      id: "user-new",
      email: "newclient",
      role: "CLIENT",
      mustChangePassword: true,
    });
    clientCreate.mockResolvedValue({ id: "client-new" });

    const fd = new FormData();
    fd.set("username", "newclient");
    fd.set("tempPassword", "temporary1");
    fd.set("linkMode", "new");
    fd.set("newClientName", "Pat Client");
    fd.set("newClientAge", "30");
    fd.set("newClientHeightFeet", "5");
    fd.set("newClientHeightInInches", "10");
    fd.set("newClientBodyWeightLb", "160");

    const result = await createClientLoginAndLink(fd);

    expect(result.ok).toBe(true);
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "newclient",
          role: "CLIENT",
          mustChangePassword: true,
          passwordHash: "hashed:temporary1",
        }),
      })
    );
  });

  it("updates existing unlinked CLIENT with temp password and mustChangePassword", async () => {
    const { createClientLoginAndLink, auth } = await loadAccounts();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(trainerSession());
    userFindUnique.mockResolvedValue({
      id: "user-existing",
      email: "pat",
      role: "CLIENT",
    });
    clientFindFirst.mockResolvedValue(null);
    userUpdate.mockResolvedValue({
      id: "user-existing",
      email: "pat",
      role: "CLIENT",
      mustChangePassword: true,
    });
    clientFindUnique.mockResolvedValue({
      id: "client-1",
      userId: null,
      trainerId: "trainer-1",
    });
    clientUpdate.mockResolvedValue({ id: "client-1" });

    const fd = new FormData();
    fd.set("username", "pat");
    fd.set("tempPassword", "temporary1");
    fd.set("linkMode", "existing");
    fd.set("existingClientId", "client-1");

    const result = await createClientLoginAndLink(fd);

    expect(result.ok).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-existing" },
        data: expect.objectContaining({
          mustChangePassword: true,
          passwordHash: "hashed:temporary1",
        }),
      })
    );
  });
});

describe("changeMyPassword", () => {
  it("clears mustChangePassword on success", async () => {
    const { changeMyPassword, auth } = await loadAccounts();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(clientSession());
    userFindUnique.mockResolvedValue({
      id: "client-user-1",
      passwordHash: "hashed:oldpassword",
    });
    userUpdate.mockResolvedValue({});

    const fd = new FormData();
    fd.set("currentPassword", "oldpassword");
    fd.set("newPassword", "newpassword1");

    const result = await changeMyPassword(fd);

    expect(result.ok).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "client-user-1" },
        data: expect.objectContaining({
          mustChangePassword: false,
          passwordHash: "hashed:newpassword1",
        }),
      })
    );
  });

  it("rejects incorrect current password", async () => {
    const { changeMyPassword, auth } = await loadAccounts();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(clientSession());
    userFindUnique.mockResolvedValue({
      id: "client-user-1",
      passwordHash: "hashed:oldpassword",
    });

    const fd = new FormData();
    fd.set("currentPassword", "wrong");
    fd.set("newPassword", "newpassword1");

    const result = await changeMyPassword(fd);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.currentPassword).toMatch(/incorrect/i);
    }
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe("resetPasswordWithToken", () => {
  it("updates password, clears mustChangePassword, and marks token used", async () => {
    const { resetPasswordWithToken } = await loadAccounts();
    const { hashPasswordResetToken } = await import("@/lib/password-reset-token");
    const raw = "a".repeat(64);
    const tokenHash = hashPasswordResetToken(raw);

    passwordResetTokenFindUnique.mockResolvedValue({
      id: "prt-1",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 60_000),
      used: false,
    });
    userUpdate.mockResolvedValue({});
    passwordResetTokenUpdate.mockResolvedValue({});

    const fd = new FormData();
    fd.set("token", raw);
    fd.set("newPassword", "brandnew12");
    fd.set("confirmPassword", "brandnew12");

    const result = await resetPasswordWithToken(fd);

    expect(result.ok).toBe(true);
    expect(passwordResetTokenFindUnique).toHaveBeenCalledWith({
      where: { token: tokenHash },
      select: { id: true, userId: true, expiresAt: true, used: true },
    });
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          mustChangePassword: false,
          passwordHash: "hashed:brandnew12",
        }),
      })
    );
    expect(passwordResetTokenUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "prt-1" },
        data: { used: true },
      })
    );
  });

  it("rejects expired or used tokens", async () => {
    const { resetPasswordWithToken } = await loadAccounts();
    passwordResetTokenFindUnique.mockResolvedValue({
      id: "prt-1",
      userId: "user-1",
      expiresAt: new Date(Date.now() - 1000),
      used: false,
    });

    const fd = new FormData();
    fd.set("token", "b".repeat(64));
    fd.set("newPassword", "brandnew12");
    fd.set("confirmPassword", "brandnew12");

    const result = await resetPasswordWithToken(fd);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.token).toMatch(/invalid or expired/i);
    }
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe("createPasswordResetTokenForUser", () => {
  it("stores a hash and returns the raw token once", async () => {
    const { createPasswordResetTokenForUser } = await import(
      "@/lib/create-password-reset-token"
    );
    const { hashPasswordResetToken } = await import("@/lib/password-reset-token");

    userFindUnique.mockResolvedValue({ id: "user-1" });
    passwordResetTokenCreate.mockResolvedValue({});

    const result = await createPasswordResetTokenForUser("user-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.token).toHaveLength(64);
    expect(passwordResetTokenCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        token: hashPasswordResetToken(result.token),
      }),
    });
  });
});

describe("requestPasswordReset", () => {
  it("always returns ok (no username enumeration)", async () => {
    const { requestPasswordReset } = await loadAccounts();
    const fd = new FormData();
    fd.set("username", "anyone");
    const result = await requestPasswordReset(fd);
    expect(result).toEqual({ ok: true });
  });
});
