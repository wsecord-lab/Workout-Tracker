import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  prisma: { apiKey: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { prisma } from "./db";
import { authenticateKey, bearerToken, generateApiKey, hashApiKey } from "./apikeys";

const findUnique = prisma.apiKey.findUnique as unknown as ReturnType<typeof vi.fn>;
const update = prisma.apiKey.update as unknown as ReturnType<typeof vi.fn>;

describe("api keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue({});
  });

  it("generates long, unique, prefixed keys and stores only a hash", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.startsWith("wt_")).toBe(true);
    expect(a.length).toBeGreaterThan(40);
    expect(a).not.toBe(b);
    expect(hashApiKey(a)).not.toContain(a);
    expect(hashApiKey(a)).toHaveLength(64);
  });

  it("parses Bearer headers", () => {
    expect(bearerToken("Bearer wt_abc")).toBe("wt_abc");
    expect(bearerToken("bearer wt_abc")).toBe("wt_abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it("rejects missing, malformed, unknown and revoked keys", async () => {
    expect(await authenticateKey(null)).toBeNull();
    expect(await authenticateKey("not-a-key")).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();

    findUnique.mockResolvedValueOnce(null);
    expect(await authenticateKey("wt_unknown")).toBeNull();

    findUnique.mockResolvedValueOnce({
      id: "k1",
      revokedAt: new Date(),
      user: { id: "u1", email: "a@b.c", name: null, role: "CLIENT" },
    });
    expect(await authenticateKey("wt_revoked")).toBeNull();
  });

  it("returns the account for a valid key", async () => {
    findUnique.mockResolvedValueOnce({
      id: "k1",
      revokedAt: null,
      user: { id: "u1", email: "a@b.c", name: "A", role: "TRAINER" },
    });
    const actor = await authenticateKey("wt_good");
    expect(actor).toMatchObject({ id: "u1", role: "TRAINER", apiKeyId: "k1" });
    expect(findUnique.mock.calls[0][0].where.keyHash).toBe(hashApiKey("wt_good"));
  });
});

describe("expired sign-in tokens", () => {
  it("are rejected", async () => {
    findUnique.mockResolvedValueOnce({
      id: "k1",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      user: { id: "u1", email: "a@b.c", name: null, role: "CLIENT" },
    });
    expect(await authenticateKey("wt_expired")).toBeNull();
  });
});
