export default function Loading() {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 py-12"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
        aria-hidden
      />
      <p className="text-sm text-muted">Loading…</p>
    </div>
  );
}