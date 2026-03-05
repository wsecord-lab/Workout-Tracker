"use client";

import { useRouter } from "next/navigation";

export function ChartsHeader({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleBack}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-[var(--text)] outline-none hover:bg-[var(--border)] focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        ← Back
      </button>
      <h1 className="text-2xl font-bold text-[var(--text)]">Workout Progress Analytics</h1>
    </div>
  );
}
