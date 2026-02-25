"use client";

import Link from "next/link";

export function LoadMoreSessions({
  clientId,
  hasMore,
  currentTake,
}: {
  clientId: string;
  hasMore: boolean;
  currentTake: number;
}) {
  if (!hasMore) return null;

  const nextTake = currentTake + 20;
  const href = `/clients/${clientId}?take=${nextTake}`;

  return (
    <div className="flex justify-center pt-4">
      <Link href={href} className="btn-secondary">
        Load more sessions
      </Link>
    </div>
  );
}
