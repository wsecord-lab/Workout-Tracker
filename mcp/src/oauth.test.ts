import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  prisma: {
    oAuthClient: { create: vi.fn(), findUnique: vi.fn() },
    oAuthCode: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    apiKey: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock("./db", () => ({ prisma: m.prisma }));

import { createHash } from "node:crypto";
import {
  checkAuthorizeRequest,
  exchangeAuthorizationCode,
  isAllowedRedirectUri,
  OAuthError,
  pkceChallenge,
  redirectUriMatches,
  refreshTokens,
  registerClient,
  verifyPkce,
} from "./oauth";
import { safeCallbackUrl } from "../../src/app/login/callback-url";

const VERIFIER = "a".repeat(64);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("PKCE", () => {
  it("accepts the right verifier and rejects wrong or malformed ones", () => {
    const challenge = pkceChallenge(VERIFIER);
    expect(verifyPkce(VERIFIER, challenge)).toBe(true);
    expect(verifyPkce("b".repeat(64), challenge)).toBe(false);
    expect(verifyPkce("short", pkceChallenge("short"))).toBe(false);
    expect(verifyPkce(null, challenge)).toBe(false);
  });
});

describe("redirect addresses", () => {
  it("allows https and loopback http only", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:3118/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://evil.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("https://a.com/cb#frag")).toBe(false);
    expect(isAllowedRedirectUri("https://user:pw@a.com/cb")).toBe(false);
  });

  it("matches exactly, with loopback ports allowed to differ", () => {
    const reg = ["https://claude.ai/api/mcp/auth_callback", "http://localhost/callback"];
    expect(redirectUriMatches(reg, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectUriMatches(reg, "https://claude.ai/api/mcp/other")).toBe(false);
    expect(redirectUriMatches(reg, "https://evil.com/api/mcp/auth_callback")).toBe(false);
    expect(redirectUriMatches(reg, "http://localhost:5555/callback")).toBe(true);
    expect(redirectUriMatches(reg, "http://localhost:5555/steal")).toBe(false);
    expect(redirectUriMatches(["https://claude.ai/x"], "http://localhost:1/x")).toBe(false);
  });
});

describe("login callback", () => {
  it("only ever sends people back to the approval page", () => {
    expect(safeCallbackUrl("/oauth/authorize?client_id=x")).toBe("/oauth/authorize?client_id=x");
    expect(safeCallbackUrl("/oauth/authorize")).toBe("/oauth/authorize");
    expect(safeCallbackUrl("https://evil.com")).toBeNull();
    expect(safeCallbackUrl("//evil.com")).toBeNull();
    expect(safeCallbackUrl("/oauth/authorizeevil")).toBeNull();
    expect(safeCallbackUrl("/dashboard")).toBeNull();
    expect(safeCallbackUrl(undefined)).toBeNull();
  });
});

describe("registration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects bad redirect lists", async () => {
    await expect(registerClient({ redirectUris: [] })).rejects.toBeInstanceOf(OAuthError);
    await expect(registerClient({ redirectUris: "https://a.com" })).rejects.toBeInstanceOf(OAuthError);
    await expect(registerClient({ redirectUris: ["http://evil.com/cb"] })).rejects.toBeInstanceOf(OAuthError);
    await expect(registerClient({ redirectUris: Array(6).fill("https://a.com/cb") })).rejects.toBeInstanceOf(OAuthError);
    expect(m.prisma.oAuthClient.create).not.toHaveBeenCalled();
  });

  it("registers a valid client", async () => {
    m.prisma.oAuthClient.create.mockResolvedValue({});
    const c = await registerClient({ clientName: "  Claude ", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] });
    expect(c.clientId.startsWith("wtclient_")).toBe(true);
    expect(c.clientName).toBe("Claude");
  });
});

describe("authorize request checks", () => {
  beforeEach(() => vi.clearAllMocks());
  const good = {
    response_type: "code",
    client_id: "c1",
    redirect_uri: "https://claude.ai/cb",
    code_challenge: pkceChallenge(VERIFIER),
    code_challenge_method: "S256",
  };

  it("accepts a good request", async () => {
    m.prisma.oAuthClient.findUnique.mockResolvedValue({ clientId: "c1", clientName: "Claude", redirectUris: ["https://claude.ai/cb"] });
    const r = await checkAuthorizeRequest(good);
    expect(r.ok).toBe(true);
  });

  it("rejects unknown client, unregistered redirect, missing PKCE, plain PKCE", async () => {
    m.prisma.oAuthClient.findUnique.mockResolvedValueOnce(null);
    expect((await checkAuthorizeRequest(good)).ok).toBe(false);

    m.prisma.oAuthClient.findUnique.mockResolvedValue({ clientId: "c1", clientName: null, redirectUris: ["https://claude.ai/cb"] });
    expect((await checkAuthorizeRequest({ ...good, redirect_uri: "https://evil.com/cb" })).ok).toBe(false);
    expect((await checkAuthorizeRequest({ ...good, code_challenge: undefined })).ok).toBe(false);
    expect((await checkAuthorizeRequest({ ...good, code_challenge_method: "plain" })).ok).toBe(false);
    expect((await checkAuthorizeRequest({ ...good, response_type: "token" })).ok).toBe(false);
  });
});

describe("code exchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.oAuthClient.findUnique.mockResolvedValue({ clientId: "c1", clientName: "Claude" });
    m.prisma.apiKey.create.mockResolvedValue({});
    m.prisma.apiKey.deleteMany.mockResolvedValue({});
  });
  const row = {
    id: "code1",
    clientId: "c1",
    userId: "u1",
    redirectUri: "https://claude.ai/cb",
    codeChallenge: pkceChallenge(VERIFIER),
  };
  const args = { code: "wtc_x", clientId: "c1", redirectUri: "https://claude.ai/cb", codeVerifier: VERIFIER };

  it("issues tokens for a valid code and stores only hashes", async () => {
    m.prisma.oAuthCode.findUnique.mockResolvedValue(row);
    m.prisma.oAuthCode.updateMany.mockResolvedValue({ count: 1 });
    const t = await exchangeAuthorizationCode(args);
    expect(t.access_token.startsWith("wt_")).toBe(true);
    expect(t.refresh_token.startsWith("wtr_")).toBe(true);
    expect(t.expires_in).toBe(3600);
    const stored = m.prisma.apiKey.create.mock.calls[0][0].data;
    expect(stored.userId).toBe("u1");
    expect(stored.keyHash).toBe(sha(t.access_token));
    expect(stored.refreshHash).toBe(sha(t.refresh_token));
    expect(JSON.stringify(stored)).not.toContain(t.access_token);
  });

  it("burns the code even when the verifier is wrong", async () => {
    m.prisma.oAuthCode.findUnique.mockResolvedValue(row);
    m.prisma.oAuthCode.updateMany.mockResolvedValue({ count: 1 });
    await expect(exchangeAuthorizationCode({ ...args, codeVerifier: "z".repeat(64) })).rejects.toMatchObject({ error: "invalid_grant" });
    expect(m.prisma.oAuthCode.updateMany).toHaveBeenCalled();
    expect(m.prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("rejects used/expired codes, wrong client, wrong redirect, unknown code", async () => {
    m.prisma.oAuthCode.findUnique.mockResolvedValue(row);
    m.prisma.oAuthCode.updateMany.mockResolvedValue({ count: 0 });
    await expect(exchangeAuthorizationCode(args)).rejects.toMatchObject({ error: "invalid_grant" });

    m.prisma.oAuthCode.updateMany.mockResolvedValue({ count: 1 });
    await expect(exchangeAuthorizationCode({ ...args, redirectUri: "https://evil.com/cb" })).rejects.toMatchObject({ error: "invalid_grant" });

    m.prisma.oAuthCode.findUnique.mockResolvedValue({ ...row, clientId: "other" });
    await expect(exchangeAuthorizationCode(args)).rejects.toMatchObject({ error: "invalid_grant" });

    m.prisma.oAuthCode.findUnique.mockResolvedValue(null);
    await expect(exchangeAuthorizationCode(args)).rejects.toMatchObject({ error: "invalid_grant" });

    await expect(exchangeAuthorizationCode({ ...args, code: null })).rejects.toMatchObject({ error: "invalid_request" });
    expect(m.prisma.apiKey.create).not.toHaveBeenCalled();
  });
});

describe("refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.prisma.oAuthClient.findUnique.mockResolvedValue({ clientId: "c1", clientName: "Claude" });
    m.prisma.apiKey.create.mockResolvedValue({});
    m.prisma.apiKey.deleteMany.mockResolvedValue({});
  });
  const live = { id: "k1", userId: "u1", oauthClientId: "c1", revokedAt: null, refreshExpiresAt: new Date(Date.now() + 1e7) };

  it("rotates: old token revoked, new pair issued", async () => {
    m.prisma.apiKey.findUnique.mockResolvedValue(live);
    m.prisma.apiKey.updateMany.mockResolvedValue({ count: 1 });
    const t = await refreshTokens({ refreshToken: "wtr_old", clientId: "c1" });
    expect(t.access_token).toBeTruthy();
    expect(m.prisma.apiKey.updateMany.mock.calls[0][0].where).toEqual({ id: "k1", revokedAt: null });
  });

  it("rejects replayed, expired, unknown and other-client refresh tokens", async () => {
    m.prisma.apiKey.findUnique.mockResolvedValue({ ...live, revokedAt: new Date() });
    await expect(refreshTokens({ refreshToken: "wtr_old", clientId: "c1" })).rejects.toMatchObject({ error: "invalid_grant" });
    m.prisma.apiKey.findUnique.mockResolvedValue({ ...live, refreshExpiresAt: new Date(Date.now() - 1) });
    await expect(refreshTokens({ refreshToken: "wtr_old", clientId: "c1" })).rejects.toMatchObject({ error: "invalid_grant" });
    m.prisma.apiKey.findUnique.mockResolvedValue(null);
    await expect(refreshTokens({ refreshToken: "wtr_old", clientId: "c1" })).rejects.toMatchObject({ error: "invalid_grant" });
    m.prisma.apiKey.findUnique.mockResolvedValue(live);
    await expect(refreshTokens({ refreshToken: "wtr_old", clientId: "someone-else" })).rejects.toMatchObject({ error: "invalid_grant" });
    expect(m.prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("loses the race gracefully when two refreshes arrive at once", async () => {
    m.prisma.apiKey.findUnique.mockResolvedValue(live);
    m.prisma.apiKey.updateMany.mockResolvedValue({ count: 0 });
    await expect(refreshTokens({ refreshToken: "wtr_old", clientId: "c1" })).rejects.toMatchObject({ error: "invalid_grant" });
    expect(m.prisma.apiKey.create).not.toHaveBeenCalled();
  });
});
