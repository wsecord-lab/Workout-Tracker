import { PrismaClient } from "@prisma/client";
import { getEnv } from "@/lib/env";

// Validate env on first DB access (fail fast)
getEnv();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

let pragmasInitialized = false;

/** Run SQLite pragmas once per process (server-side only). Call from root layout or first route. */
export async function initSqlitePragmas(): Promise<void> {
  if (pragmasInitialized) return;
  pragmasInitialized = true;
  // SQLite PRAGMAs return results; use queryRaw (executeRaw disallows results)
  await prisma.$queryRawUnsafe(`PRAGMA journal_mode=WAL;`);
  await prisma.$queryRawUnsafe(`PRAGMA synchronous=NORMAL;`);
  await prisma.$queryRawUnsafe(`PRAGMA busy_timeout=5000;`);
}
