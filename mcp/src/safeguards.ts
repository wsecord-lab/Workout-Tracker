import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { Actor } from "./trainer";

/** Most AI writes one account may make per rolling hour. Undo does not count, so you can always recover. */
export const MAX_WRITES_PER_HOUR = 20;

export type Tx = Prisma.TransactionClient;

/** Refuse when the account has hit its hourly write limit. */
export async function enforceWriteLimit(actor: Actor, now = new Date()): Promise<void> {
  const since = new Date(now.getTime() - 60 * 60 * 1000);
  const used = await prisma.mcpChange.count({
    where: { userId: actor.id, createdAt: { gte: since }, tool: { not: "undo_ai_change" } },
  });
  if (used >= MAX_WRITES_PER_HOUR) {
    throw new Error(
      `Write limit reached: ${MAX_WRITES_PER_HOUR} AI changes per hour. Wait a bit, or make further edits in the app. Nothing was changed.`
    );
  }
}

/** Finished workouts are history. The AI may not touch them. */
export function assertSessionEditable(session: { finishedAt: Date | null }): void {
  if (session.finishedAt) {
    throw new Error(
      "This workout is finished, so it is locked for AI edits to protect your history. Edit it in the app if you really need to."
    );
  }
}

export type ChangeRecord = {
  tool: string;
  entityType: "session" | "set" | "exercise";
  entityId: string;
  sessionId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
};

/** Save what changed. Call inside the same transaction as the change itself. */
export async function recordChange(tx: Tx, actor: Actor, change: ChangeRecord) {
  return tx.mcpChange.create({
    data: {
      userId: actor.id,
      apiKeyId: actor.apiKeyId,
      tool: change.tool,
      entityType: change.entityType,
      entityId: change.entityId,
      sessionId: change.sessionId ?? null,
      before: change.before ?? undefined,
      after: change.after ?? undefined,
    },
    select: { id: true },
  });
}

/** JSON with object keys sorted, so field order never matters (Postgres jsonb reorders keys). */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

/** True when two JSON-ish snapshots hold the same values, whatever the key order. */
export function sameSnapshot(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}
