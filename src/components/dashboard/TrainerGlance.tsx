import type { ReactNode } from "react";
import Link from "next/link";
import { formatDuration, getElapsedSeconds } from "@/lib/session-duration";
import { formatCalendarDay, formatRelativeInstant } from "./relative-time";

export type GlanceClient = {
  id: string;
  name: string;
};

export type InProgressSession = {
  id: string;
  name: string | null;
  startedAt: string;
  pausedAt: string | null;
  totalPausedSeconds: number;
  date: string;
  client: GlanceClient;
};

export type UpcomingSession = {
  id: string;
  name: string | null;
  date: string;
  client: GlanceClient;
};

export type RecentSession = {
  id: string;
  name: string | null;
  finishedAt: string;
  date: string;
  client: GlanceClient;
};

export type LastTrainedRow = {
  client: GlanceClient;
  lastFinishedAt: string | null;
  lastSessionName: string | null;
};

type Props = {
  inProgress: InProgressSession[];
  upcoming: UpcomingSession[];
  recent: RecentSession[];
  lastTrained: LastTrainedRow[];
  nowIso?: string;
};

const rowLinkClass =
  "flex flex-col gap-0.5 px-4 py-3 outline-none transition-colors hover:bg-primary/10 focus:ring-2 focus:ring-primary focus:ring-inset sm:flex-row sm:items-center sm:justify-between sm:gap-3";

function Section({
  title,
  children,
  empty,
  hasItems,
}: {
  title: string;
  children: ReactNode;
  empty: string;
  hasItems: boolean;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded border border-border bg-surface">
        {!hasItems ? (
          <li className="px-4 py-5 text-sm text-muted">{empty}</li>
        ) : (
          children
        )}
      </ul>
    </section>
  );
}

function StatusBadge({ paused }: { paused: boolean }) {
  if (paused) {
    return (
      <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">
        Paused
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
      In progress
    </span>
  );
}

export function TrainerGlance({
  inProgress,
  upcoming,
  recent,
  lastTrained,
  nowIso,
}: Props) {
  const now = nowIso ? new Date(nowIso) : new Date();

  return (
    <div>
      <Section
        title="Needs attention"
        empty="No workouts in progress."
        hasItems={inProgress.length > 0}
      >
        {inProgress.map((s) => {
          const elapsed = getElapsedSeconds(s.startedAt, now, {
            totalPausedSeconds: s.totalPausedSeconds,
            pausedAt: s.pausedAt,
          });
          const paused = s.pausedAt != null;
          return (
            <li key={s.id}>
              <Link href={`/clients/${s.client.id}`} className={rowLinkClass}>
                <span className="min-w-0">
                  <span className="block font-medium text-[var(--text)]">
                    {s.client.name}
                  </span>
                  <span className="block text-sm text-muted">
                    {s.name?.trim() || "Workout"} · started{" "}
                    {formatRelativeInstant(s.startedAt, now)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2 text-sm text-muted">
                  <StatusBadge paused={paused} />
                  <span className="whitespace-nowrap">
                    {formatDuration(elapsed)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </Section>

      <Section
        title="Up next"
        empty="No upcoming sessions on the calendar."
        hasItems={upcoming.length > 0}
      >
        {upcoming.map((s) => (
          <li key={s.id}>
            <Link
              href={`/clients/${s.client.id}/calendar`}
              className={rowLinkClass}
            >
              <span className="min-w-0">
                <span className="block font-medium text-[var(--text)]">
                  {s.client.name}
                </span>
                <span className="block text-sm text-muted">
                  {s.name?.trim() || "Session"}
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium text-[var(--text)]">
                {formatCalendarDay(s.date, now)}
              </span>
            </Link>
          </li>
        ))}
      </Section>

      <Section
        title="Recent activity"
        empty="No finished workouts yet."
        hasItems={recent.length > 0}
      >
        {recent.map((s) => (
          <li key={s.id}>
            <Link href={`/clients/${s.client.id}`} className={rowLinkClass}>
              <span className="min-w-0">
                <span className="block font-medium text-[var(--text)]">
                  {s.client.name}
                </span>
                <span className="block text-sm text-muted">
                  {s.name?.trim() || "Workout"}
                </span>
              </span>
              <span className="shrink-0 text-sm text-muted">
                {formatRelativeInstant(s.finishedAt, now)}
              </span>
            </Link>
          </li>
        ))}
      </Section>

      <Section
        title="Last trained"
        empty="Add a client to get started."
        hasItems={lastTrained.length > 0}
      >
        {lastTrained.map((row) => (
          <li key={row.client.id}>
            <Link href={`/clients/${row.client.id}`} className={rowLinkClass}>
              <span className="min-w-0">
                <span className="block font-medium text-[var(--text)]">
                  {row.client.name}
                </span>
                {row.lastSessionName ? (
                  <span className="block text-sm text-muted">
                    {row.lastSessionName}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-sm text-muted">
                {row.lastFinishedAt
                  ? formatRelativeInstant(row.lastFinishedAt, now)
                  : "Never"}
              </span>
            </Link>
          </li>
        ))}
      </Section>
    </div>
  );
}
