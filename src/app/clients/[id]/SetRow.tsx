"use client";

import { useTransition } from "react";
import type { Set } from "@prisma/client";
import { deleteSet } from "@/app/actions/sets";
import { formatWeight } from "@/lib/units";

export function SetRow({ set }: { set: Set }) {
  const [isPending, startTransition] = useTransition();
  return (
    <li className="flex items-center justify-between text-sm">
      <span>
        {formatWeight(set.weightKg)} × {set.reps} reps
      </span>
      <button
        type="button"
        onClick={() => startTransition(() => deleteSet(set.id))}
        disabled={isPending}
        className="text-error hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded disabled:opacity-50"
      >
        {isPending ? "…" : "Remove"}
      </button>
    </li>
  );
}
