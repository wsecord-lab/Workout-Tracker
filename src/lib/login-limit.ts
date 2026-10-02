import { createHash } from "crypto";
import { prisma } from "@/lib/db";

/**
 * Failed sign-in limits. Deliberately forgiving: someone who forgets their
 * password gets 10 tries every 15 minutes, while guessing at scale is capped.
 *
 * - username + IP: 10 failures / 15 min  (the normal "I forgot my password" case)
 * - username, any IP: 100 failures / hour (many machines guessing one account)
 * - IP, any username: 100 failures / 15 min (one machine guessing many accounts)
 *
 * Only failures are stored, as hashed keys, and rows older than the longest window are pruned.
 */
const MINUTE = 60 * 1000;

type Limit = { key: string; max: number; windowMs: number };

function loginLimits(username: string, ip: string): Limit[] {
  return [
    { key: `user-ip:${username}|${ip}`, max: 10, windowMs: 15 * MINUTE },
    { key: `user:${username}`, max: 100, windowMs: 60 * MINUTE },
    { key: `ip:${ip}`, max: 100, windowMs: 15 * MINUTE },
  ];
}

const LONGEST_WINDOW_MS = 60 * MINUTE;

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Best-effort client IP. Vercel sets x-real-ip / x-forwarded-for and overwrites client-supplied values. */
export function clientIp(headers: Headers | null | undefined): string {
  const real = headers?.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

export type LimitCheck = { allowed: true } | { allowed: false; retryAfterMinutes: number };

/** Count recent failures for each key; blocked when any key is at its limit. */
async function check(limits: Limit[], now: number): Promise<LimitCheck> {
  let retryAfterMs = 0;
  for (const limit of limits) {
    const since = new Date(now - limit.windowMs);
    const key = hashKey(limit.key);
    const count = await prisma.loginAttempt.count({ where: { key, createdAt: { gte: since } } });
    if (count < limit.max) continue;
    // Blocked until enough old failures age out of the window to drop below the limit.
    const oldest = await prisma.loginAttempt.findMany({
      where: { key, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      skip: count - limit.max,
      take: 1,
      select: { createdAt: true },
    });
    const freesAt = (oldest[0]?.createdAt.getTime() ?? now) + limit.windowMs;
    retryAfterMs = Math.max(retryAfterMs, freesAt - now);
  }
  if (retryAfterMs <= 0) return { allowed: true };
  return { allowed: false, retryAfterMinutes: Math.max(1, Math.ceil(retryAfterMs / MINUTE)) };
}

async function record(limits: Limit[]): Promise<void> {
  await prisma.loginAttempt.createMany({
    data: limits.map((l) => ({ key: hashKey(l.key) })),
  });
  await prisma.loginAttempt
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - LONGEST_WINDOW_MS) } } })
    .catch(() => {});
}

export function checkLoginAllowed(username: string, ip: string, now = Date.now()) {
  return check(loginLimits(username, ip), now);
}

export function recordLoginFailure(username: string, ip: string) {
  return record(loginLimits(username, ip));
}

/**
 * A successful sign-in resets this person's own counter on this device.
 * The account-wide and IP-wide counters stay, so a correct guess can't reset an attack in progress.
 */
export async function clearLoginFailures(username: string, ip: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({
    where: { key: hashKey(loginLimits(username, ip)[0].key) },
  });
}

/** Open AI-app registration (no sign-in required): 20 per IP per hour. */
function registrationLimits(ip: string): Limit[] {
  return [{ key: `oauth-register:${ip}`, max: 20, windowMs: 60 * MINUTE }];
}

export function checkRegistrationAllowed(ip: string, now = Date.now()) {
  return check(registrationLimits(ip), now);
}

export function recordRegistration(ip: string) {
  return record(registrationLimits(ip));
}
