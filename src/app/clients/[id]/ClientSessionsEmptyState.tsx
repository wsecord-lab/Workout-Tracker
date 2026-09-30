type Props = {
  /** When true, show trainer-oriented next steps (add a session). */
  isClient?: boolean;
};

/**
 * First-run empty state when a client profile has no workout sessions yet.
 */
export function ClientSessionsEmptyState({ isClient = false }: Props) {
  if (isClient) {
    return (
      <div className="rounded border border-border bg-surface px-4 py-6 text-center sm:text-left">
        <h2 className="text-lg font-semibold text-[var(--text)]">No workouts yet</h2>
        <p className="mt-2 text-sm text-muted">
          When your trainer adds a session, it will show up here. You can also start one
          yourself with <span className="text-[var(--text)]">Add Session</span> above —
          then log sets as you train.
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Use Add Session to begin a workout</li>
          <li>Open Calendar to see rest days and planned days</li>
          <li>Check View Charts once you have a few sessions logged</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-surface px-4 py-6">
      <h2 className="text-lg font-semibold text-[var(--text)]">No sessions yet</h2>
      <p className="mt-2 text-sm text-muted">
        Add a session to get this client started. You can apply a template or build the
        workout from scratch, then they can open it on their own login.
      </p>
    </div>
  );
}
