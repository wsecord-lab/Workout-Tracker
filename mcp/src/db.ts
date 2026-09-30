import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { mcpPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.mcpPrisma ??
  new PrismaClient({
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.mcpPrisma = prisma;
}
