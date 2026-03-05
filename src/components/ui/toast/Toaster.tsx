"use client";

import type { Toast } from "./ToastContext";

export function Toaster({
  toasts,
  removeToast,
}: {
  toasts: Toast[];
  removeToast: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      role="status"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg ${
            t.type === "success"
              ? "border-green-600/30 bg-green-50 dark:bg-green-950/80 text-green-800 dark:text-green-200"
              : "border-red-600/30 bg-red-50 dark:bg-red-950/80 text-red-800 dark:text-red-200"
          }`}
        >
          <p className="text-sm font-medium">{t.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {t.undo && (
              <button
                type="button"
                onClick={() => {
                  t.undo?.onUndo();
                  removeToast(t.id);
                }}
                className="text-xs font-medium underline opacity-90 hover:opacity-100 focus:ring-2 focus:ring-offset-1 rounded"
                aria-label={t.undo.label}
              >
                {t.undo.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="text-xs underline opacity-80 hover:opacity-100 focus:ring-2 focus:ring-offset-1 rounded"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
