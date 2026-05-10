"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  deleteExercise,
  restoreExercise,
  hardDeleteExercise,
} from "@/app/actions/exercises";
import { useToast } from "@/components/ui/toast/use-toast";

const UNDO_GRACE_MS = 30_000;
const MODAL_BACKDROP_Z = 1000;
const MODAL_PANEL_Z = 1001;

export function DeleteExerciseButton({
  exerciseId,
  exerciseName,
  setsCount,
}: {
  exerciseId: string;
  exerciseName: string;
  setsCount: number;
}) {
  const router = useRouter();
  const { addToast, removeToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastIdRef = useRef<string | null>(null);

  async function handleConfirmRemove() {
    setDeleting(true);
    const result = await deleteExercise(exerciseId);
    setDeleting(false);
    setModalOpen(false);
    if (!result) return;
    router.refresh();

    const toastId = addToast(
      "success",
      "Exercise removed. You can undo this for 30 seconds.",
      {
        undoLabel: "Undo",
        onUndo: async () => {
          if (undoTimeoutRef.current != null) {
            clearTimeout(undoTimeoutRef.current);
            undoTimeoutRef.current = null;
          }
          await restoreExercise(exerciseId);
          router.refresh();
          if (toastIdRef.current) removeToast(toastIdRef.current);
        },
      }
    );
    toastIdRef.current = toastId;

    undoTimeoutRef.current = setTimeout(async () => {
      undoTimeoutRef.current = null;
      await hardDeleteExercise(exerciseId);
      router.refresh();
      if (toastIdRef.current) removeToast(toastIdRef.current);
      toastIdRef.current = null;
    }, UNDO_GRACE_MS);
  }

  const setsCopy =
    setsCount === 0
      ? " (no sets)"
      : setsCount === 1
        ? " and its 1 set"
        : ` and all ${setsCount} sets`;

  useEffect(() => {
    if (!modalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  const modal =
    modalOpen &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        className="fixed inset-0 flex items-center justify-center p-4 bg-black/50"
        style={{ zIndex: MODAL_BACKDROP_Z }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-exercise-title"
        aria-describedby="delete-exercise-desc"
        onClick={(e) => {
          if (e.target === e.currentTarget && !deleting) setModalOpen(false);
        }}
      >
        <div
          className="rounded-lg border border-border bg-background p-5 shadow-lg max-w-md w-full space-y-4 max-h-[90vh] overflow-y-auto"
          style={{ zIndex: MODAL_PANEL_Z }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id="delete-exercise-title"
            className="text-lg font-semibold text-[var(--text)]"
          >
            Remove this exercise?
          </h2>
          <p
            id="delete-exercise-desc"
            className="text-sm text-muted leading-relaxed"
          >
            This will remove &quot;{exerciseName}&quot;{setsCopy}. You can undo
            this for 30 seconds after removing.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={deleting}
              className="tap-target btn-secondary text-sm py-2 px-4 rounded focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmRemove}
              disabled={deleting}
              className="tap-target rounded border border-error/40 bg-error/10 px-4 py-2 text-sm font-medium text-error outline-none hover:bg-error/20 focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
            >
              {deleting ? "Removing…" : "Remove exercise"}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        disabled={deleting}
        className="tap-target text-sm text-error hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded disabled:opacity-50 shrink-0"
        aria-expanded={modalOpen}
        aria-haspopup="dialog"
      >
        Remove Exercise
      </button>
      {modal}
    </>
  );
}
