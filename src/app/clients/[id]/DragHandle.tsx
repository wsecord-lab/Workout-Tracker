"use client";

import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";

function GripIcon() {
  return (
    <svg
      width="11"
      height="14"
      viewBox="0 0 11 14"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="3" cy="3" r="1.2" />
      <circle cx="8" cy="3" r="1.2" />
      <circle cx="3" cy="7" r="1.2" />
      <circle cx="8" cy="7" r="1.2" />
      <circle cx="3" cy="11" r="1.2" />
      <circle cx="8" cy="11" r="1.2" />
    </svg>
  );
}

export type DragHandleProps = {
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
  label: string;
  disabled?: boolean;
};

/**
 * The only drag affordance — dragging is handle-only so that taps on the rest
 * of a row (edit, expand, check off) keep working, and so a touch drag can't be
 * mistaken for a page scroll.
 *
 * `touch-none` is required: without it the browser claims the gesture for
 * scrolling and the pointer events never reach dnd-kit.
 */
export function DragHandle({ attributes, listeners, label, disabled }: DragHandleProps) {
  return (
    <button
      type="button"
      {...attributes}
      {...(disabled ? {} : listeners)}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="tap-target flex shrink-0 cursor-grab touch-none items-center justify-center rounded px-1 text-muted transition-colors hover:text-[var(--text)] active:cursor-grabbing disabled:opacity-30 outline-none focus:ring-2 focus:ring-primary"
    >
      <GripIcon />
    </button>
  );
}
