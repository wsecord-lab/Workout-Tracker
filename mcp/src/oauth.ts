import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { generateApiKey, hashApiKey } from "./apikeys";

/** "Sign in" for AI apps (OAuth 2.1 authorization-code flow with PKCE). */

export const ACCESS_TTL_SECONDS = 60 * 60;
export const REFRESH_TTL_SECONDS = 90 * 24 * 60 * 60;
export const CODE_TTL_SECONDS = 5 * 60;
export const SCOPE = "workouts";

const REFRESH_PREFIX = "wtr_";
const CODE_PREFIX = "wtc_";

export class OAuthError extends Error {
  constructor(
    public error: "invalid_request" | "invalid_client" | "invalid_grant" | "unsupported_grant_type",
    description: string,
    public status = 400
  ) {
    super(description);
  }
}

// ---------- pure helpers ----------

function sha256Hex(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

/** PKCE S256: base64url(sha256(verifier)). */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifyPkce(verifier: string | null | undefined, challenge: string): boolean {
  if (!verifier || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(pkceChallenge(verifier));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Redirect targets we are willing to register: https anywhere, or http only on this computer. */
export function isAllowedRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && LOOPBACK_HOSTS.has(u.hostname);
}

/** Exact match, except loopback addresses may differ in port (RFC 8252). */
export function redirectUriMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  let r: URL;
  try {
    r = new URL(requested);
  } catch {
    return false;
  }
  if (r.protocol !== "http:" || !LOOPBACK_HOSTS.has(r.hostname)) return false;
  return registered.some((reg) => {
    try {
      const g = new URL(reg);
      return (
        g.protocol === "http:" &&
        g.hostname === r.hostname &&
        g.pathname === r.pathname &&
        g.search === r.search
      );
    } catch {
      return false;
    }
  });
}

/** Public address of this site. Set PUBLIC_BASE_URL to override (e.g. behind a custom proxy). */
export function publicOrigin(req: Request): string {
  const fixed = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  return fixed || new URL(req.url).origin;
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: [SCOPE],
    resource_name: "Workout Tracker",
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
  };
}

// ---------- client registration ----------

export async function registerClient(input: { clientName?: unknown; redirectUris?: unknown }) {
  const uris = input.redirectUris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 5) {
    throw new OAuthError("invalid_request", "redirect_uris must be a list of 1 to 5 addresses.");
  }
  for (const u of uris) {
    if (typeof u !== "string" || u.length > 500 || !isAllowedRedirectUri(u)) {
      throw new OAuthError(
        "invalid_request",
        "Each redirect URI must be https (or http on localhost) and have no fragment."
      );
    }
  }
  const name =
    typeof input.clientName === "string" ? input.clientName.trim().slice(0, 100) || null : null;
  const clientId = "wtclient_" + randomBytes(16).toString("base64url");
  await prisma.oAuthClient.create({
    data: { clientId, clientName: name, redirectUris: uris as string[] },
  });
  return { clientId, clientName: name, redirectUris: uris as string[] };
}

// ---------- authorize ----------

export type AuthorizeParams = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
};

export type AuthorizeCheck =
  | { ok: false; message: string }
  | {
      ok: true;
      clientId: string;
      clientName: string | null;
      redirectUri: string;
      redirectHost: string;
      codeChallenge: string;
      state: string | null;
    };

/** Check an authorization request. Anything wrong here is shown to the person, never redirected. */
export async function checkAuthorizeRequest(p: AuthorizeParams): Promise<AuthorizeCheck> {
  if (!p.client_id || !p.redirect_uri) {
    return { ok: false, message: "This sign-in link is missing information." };
  }
  const client = await prisma.oAuthClient.findUnique({ where: { clientId: p.client_id } });
  if (!client) return { ok: false, message: "This app isn't registered. Remove it and add it again." };
  if (!redirectUriMatches(client.redirectUris, p.redirect_uri)) {
    return { ok: false, message: "This app asked to return to an address it didn't register." };
  }
  if (p.response_type !== "code") {
    return { ok: false, message: "Unsupported sign-in type." };
  }
  if (p.code_challenge_method !== "S256" || !p.code_challenge || !/^[A-Za-z0-9\-._~]{43,128}$/.test(p.code_challenge)) {
    return { ok: false, message: "This app didn't use the required secure sign-in method (PKCE)." };
  }
  return {
    ok: true,
    clientId: client.clientId,
    clientName: client.clientName,
    redirectUri: p.redirect_uri,
    redirectHost: new URL(p.redirect_uri).host,
    codeChallenge: p.code_challenge,
    state: p.state ?? null,
  };
}

/** Called after the person clicks Allow. Returns the one-time code to hand back to the app. */
export async function createAuthorizationCode(args: {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}): Promise<string> {
  const code = CODE_PREFIX + randomBytes(32).toString("base64url");
  await prisma.oAuthCode.create({
    data: {
      codeHash: sha256Hex(code),
      userId: args.userId,
      clientId: args.clientId,
      redirectUri: args.redirectUri,
      codeChallenge: args.codeChallenge,
      expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
    },
  });
  return code;
}

// ---------- token endpoint ----------

type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

async function issueTokens(userId: string, clientId: string): Promise<TokenResponse> {
  const client = await prisma.oAuthClient.findUnique({
    where: { clientId },
    select: { clientName: true },
  });
  const access = generateApiKey();
  const refresh = REFRESH_PREFIX + randomBytes(32).toString("base64url");
  const now = Date.now();
  await prisma.apiKey.create({
    data: {
      userId,
      label: `${client?.clientName ?? "AI app"} (signed in)`,
      keyHash: hashApiKey(access),
      prefix: access.slice(0, 7),
      expiresAt: new Date(now + ACCESS_TTL_SECONDS * 1000),
      refreshHash: sha256Hex(refresh),
      refreshExpiresAt: new Date(now + REFRESH_TTL_SECONDS * 1000),
      oauthClientId: clientId,
    },
  });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SECONDS,
    refresh_token: refresh,
    scope: SCOPE,
  };
}

/** Best-effort tidy-up of old sign-in tokens so the table doesn't grow forever. */
async function pruneOldTokens() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await prisma.apiKey
    .deleteMany({
      where: {
        oauthClientId: { not: null },
        OR: [{ revokedAt: { lt: weekAgo } }, { refreshExpiresAt: { lt: weekAgo } }],
      },
    })
    .catch(() => {});
}

export async function exchangeAuthorizationCode(args: {
  code?: string | null;
  clientId?: string | null;
  redirectUri?: string | null;
  codeVerifier?: string | null;
}): Promise<TokenResponse> {
  const { code, clientId, redirectUri, codeVerifier } = args;
  if (!code || !clientId || !redirectUri || !codeVerifier) {
    throw new OAuthError("invalid_request", "code, client_id, redirect_uri and code_verifier are required.");
  }
  const client = await prisma.oAuthClient.findUnique({ where: { clientId }, select: { clientId: true } });
  if (!client) throw new OAuthError("invalid_client", "Unknown client.", 401);

  const row = await prisma.oAuthCode.findUnique({ where: { codeHash: sha256Hex(code) } });
  if (!row) throw new OAuthError("invalid_grant", "Invalid code.");

  // Single use: whoever flips usedAt first wins, even if later checks fail.
  const claimed = await prisma.oAuthCode.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) throw new OAuthError("invalid_grant", "Code expired or already used.");

  if (row.clientId !== clientId || row.redirectUri !== redirectUri) {
    throw new OAuthError("invalid_grant", "Code was issued for a different client or redirect.");
  }
  if (!verifyPkce(codeVerifier, row.codeChallenge)) {
    throw new OAuthError("invalid_grant", "PKCE verification failed.");
  }

  const tokens = await issueTokens(row.userId, clientId);
  void pruneOldTokens();
  return tokens;
}

export async function refreshTokens(args: {
  refreshToken?: string | null;
  clientId?: string | null;
}): Promise<TokenResponse> {
  const { refreshToken, clientId } = args;
  if (!refreshToken || !clientId) {
    throw new OAuthError("invalid_request", "refresh_token and client_id are required.");
  }
  const row = await prisma.apiKey.findUnique({
    where: { refreshHash: sha256Hex(refreshToken) },
    select: { id: true, userId: true, oauthClientId: true, revokedAt: true, refreshExpiresAt: true },
  });
  if (
    !row ||
    row.oauthClientId !== clientId ||
    row.revokedAt ||
    !row.refreshExpiresAt ||
    row.refreshExpiresAt < new Date()
  ) {
    throw new OAuthError("invalid_grant", "Refresh token is invalid or expired.");
  }
  // Rotate: the old pair stops working the moment the new one is issued.
  const revoked = await prisma.apiKey.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count !== 1) throw new OAuthError("invalid_grant", "Refresh token was already used.");

  return issueTokens(row.userId, clientId);
}
