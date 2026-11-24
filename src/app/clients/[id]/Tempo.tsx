"use client";

import { describeTempo, TEMPO_VALUES, type TempoParts } from "@/lib/tempo";

const PHASES = [
  { key: "ecc", label: "Ecc", title: "Eccentric (lowering), seconds" },
  { key: "iso", label: "Iso", title: "Isometric (pause), seconds" },
  { key: "con", label: "Con", title: "Concentric (lifting), seconds" },
] as const;

/**
 * Three tempo dropdowns: eccentric, isometric, concentric. Each is blank or 0–10 / X.
 * "labeled" puts Ecc/Iso/Con above each box (Plan Sets); "inline" is a compact
 * 3 - 1 - 1 row for editing a single set.
 */
export function TempoSelects({
  value,
  onChange,
  idPrefix,
  layout = "labeled",
  disabled = false,
}: {
  value: TempoParts;
  onChange: (next: TempoParts) => void;
  idPrefix: string;
  layout?: "labeled" | "inline";
  disabled?: boolean;
}) {
  function setPart(i: number, v: string) {
    const next = [...value] as TempoParts;
    next[i] = v;
    onChange(next);
  }

  const select = (i: number) => (
    <select
      id={`${idPrefix}-${PHASES[i].key}`}
      value={value[i]}
      onChange={(e) => setPart(i, e.target.value)}
      disabled={disabled}
      title={PHASES[i].title}
      aria-label={layout === "inline" ? `Tempo ${PHASES[i].title}` : undefined}
      className="input w-16 px-1.5 py-0.5 text-sm min-h-[44px] sm:min-h-0"
    >
      <option value="">–</option>
      {TEMPO_VALUES.map((v) => (
        <option key={v} value={v}>{v}</option>
      ))}
    </select>
  );

  if (layout === "inline") {
    return (
      <div>
        <div className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 text-xs font-semibold text-[var(--text)]">Tempo</span>
          {select(0)}
          <span className="text-muted">-</span>
          {select(1)}
          <span className="text-muted">-</span>
          {select(2)}
        </div>
        <p className="ml-[3.375rem] mt-0.5 text-[11px] text-muted">Ecc · Iso · Con</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-[var(--text)]">
        Tempo <span className="font-normal text-muted">(optional)</span>
      </p>
      <p className="mb-1 text-[11px] text-muted">
        Seconds lowering · pausing · lifting. X = explosive. Blank = no tempo.
      </p>
      <div className="flex items-end gap-2">
        {PHASES.map((phase, i) => (
          <div key={phase.key}>
            <label htmlFor={`${idPrefix}-${phase.key}`} className="block text-xs text-muted">
              {phase.label}
            </label>
            {select(i)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "⏱ Tempo 3-1-1" chip. `compact` drops the word; `describe` spells it out beside it. */
export function TempoBadge({
  tempo,
  compact = false,
  describe = false,
}: {
  tempo: string | null | undefined;
  compact?: boolean;
  describe?: boolean;
}) {
  if (!tempo) return null;
  const description = describe ? describeTempo(tempo) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 no-underline">
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-[#cfdcae] bg-[#eef3df] px-2 py-px text-[11px] font-semibold text-[#4d601b] dark:border-[#4d601b] dark:bg-[#2b3314] dark:text-[#c5d68f]"
        title={describeTempo(tempo) ?? undefined}
      >
        <span aria-hidden="true">⏱</span>
        {compact ? tempo : `Tempo ${tempo}`}
      </span>
      {description && <span className="text-[11px] font-normal text-muted">{description}</span>}
    </span>
  );
}
