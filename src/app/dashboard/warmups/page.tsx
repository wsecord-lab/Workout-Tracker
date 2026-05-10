import Link from "next/link";
import { requireTrainer } from "@/lib/authz";
import { listWarmupBlocks } from "@/app/actions/warmup";
import { WarmupBlockManager } from "@/components/WarmupBlockManager";

export default async function WarmupsPage() {
  await requireTrainer();
  const blocks = await listWarmupBlocks();

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/dashboard"
          className="text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded btn-secondary text-sm py-1.5"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-[var(--text)]">Warmup Blocks</h1>
      </div>
      <p className="mb-6 text-sm text-muted">
        Create reusable warmup routines and assign them to client sessions.
      </p>
      <WarmupBlockManager
        blocks={blocks.map((b) => ({
          id: b.id,
          name: b.name,
          items: b.items.map((i) => ({
            id: i.id,
            name: i.name,
            details: i.details,
            orderIndex: i.orderIndex,
          })),
        }))}
      />
    </div>
  );
}
