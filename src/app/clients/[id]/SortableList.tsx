"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DragHandleProps } from "./DragHandle";

/**
 * Sensor set tuned for a mobile-first app.
 *
 * - PointerSensor needs 8px of movement so a tap on the handle isn't a drag.
 * - TouchSensor uses a 200ms long-press instead: without a delay, dnd-kit
 *   swallows the gesture and the page can no longer be scrolled by starting on
 *   a row.
 * - KeyboardSensor is not optional — it is the only keyboard reorder path now
 *   that the up/down chevrons are gone.
 */
export function useSortableSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}

export function SortableItem({
  id,
  disabled,
  label,
  children,
}: {
  id: string;
  disabled?: boolean;
  label: string;
  children: (args: { handle: DragHandleProps; isDragging: boolean }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-10 opacity-40" : undefined}
    >
      {children({
        handle: { attributes, listeners, label, disabled },
        isDragging,
      })}
    </div>
  );
}

/**
 * Vertical sortable list with optimistic ordering.
 *
 * The order is held locally and re-seeded from `items` whenever the server sends
 * a new list. Without that, the ~300ms round trip through the server action,
 * revalidatePath, and router.refresh() would visibly snap the row back to its
 * old position before landing in the new one. A rejected reorder re-seeds from
 * props, which reverts the move.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  onDragStateChange,
  renderItem,
  renderOverlay,
  itemLabel,
  disabled,
  className,
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => Promise<{ ok: boolean }>;
  onDragStateChange?: (dragging: boolean) => void;
  renderItem: (item: T, index: number, args: { handle: DragHandleProps; isDragging: boolean }) => ReactNode;
  renderOverlay?: (item: T, index: number) => ReactNode;
  itemLabel: (item: T, index: number) => string;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const sensors = useSortableSensors();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Only the ORDER is held locally — never the item objects. Items are always
  // read fresh from props, so an update that changes a row's contents but not
  // the ordering (checking a set off, editing a weight) renders immediately.
  const [orderIds, setOrderIds] = useState<string[]>(() => items.map((i) => i.id));

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const serverIdsKey = items.map((i) => i.id).join(",");

  // Re-seed when the membership changes (add, delete, or a refresh confirming
  // our optimistic order). A pure content change leaves this untouched.
  useEffect(() => {
    setOrderIds(items.map((i) => i.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverIdsKey]);

  // Drop ids the server no longer knows about, and append ones it added.
  const order = useMemo(() => {
    const known = orderIds.map((id) => itemsById.get(id)).filter((i): i is T => i != null);
    const seen = new Set(known.map((i) => i.id));
    return [...known, ...items.filter((i) => !seen.has(i.id))];
  }, [orderIds, itemsById, items]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    onDragStateChange?.(true);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    onDragStateChange?.(false);
    if (!over || active.id === over.id) return;

    const currentIds = order.map((i) => i.id);
    const from = currentIds.indexOf(String(active.id));
    const to = currentIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    const nextIds = arrayMove(currentIds, from, to);
    setOrderIds(nextIds);

    const result = await onReorder(nextIds);
    if (!result.ok) {
      setOrderIds(items.map((i) => i.id)); // reject → revert to the server's order
      return;
    }
    router.refresh();
  }

  const activeIndex = activeId ? order.findIndex((i) => i.id === activeId) : -1;
  const activeItem = activeIndex >= 0 ? order[activeIndex] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        onDragStateChange?.(false);
      }}
    >
      <SortableContext items={order.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {order.map((item, index) => (
            <SortableItem key={item.id} id={item.id} disabled={disabled} label={itemLabel(item, index)}>
              {(args) => renderItem(item, index, args)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
      {/* Portalled: the exercise accordion clips its children with
          overflow-hidden, which would cut the drag preview in half.
          dropAnimation={null}: the default animation tweens the overlay back
          onto the dragged item, but we've already moved that item
          optimistically, so the animation never resolves and leaves a fixed-
          position ghost stuck over the page. */}
      {renderOverlay && typeof document !== "undefined"
        ? createPortal(
            <DragOverlay dropAnimation={null}>
              {activeItem ? renderOverlay(activeItem, activeIndex) : null}
            </DragOverlay>,
            document.body
          )
        : null}
    </DndContext>
  );
}
