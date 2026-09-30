import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import type { Actor } from "./trainer";

export const KEY_PREFIX = "wt_";

/** A new random secret, e.g. "wt_k3J...". Shown to the person once; only its hash is stored. */
export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(32).toString("base64url");
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Pull the key out of an "Authorization: Bearer <key>" header. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** Look up the account behind a key. Null if the key is unknown or revoked. */
export async function authenticateKey(key: string | null): Promise<Actor | null> {
  if (!key || !key.startsWith(KEY_PREFIX)) return null;
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(key) },
    select: {
      id: true,
      revokedAt: true,
      user: { select: { id: true, email: true, name: true, role: true } },
    },
  });
  if (!row || row.revokedAt) return null;

  // Best effort: a failed timestamp update must not block the request.
  prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { ...row.user, apiKeyId: row.id };
}
