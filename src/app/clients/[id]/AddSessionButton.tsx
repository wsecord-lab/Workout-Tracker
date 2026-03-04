"use client";

import { useState, useTransition } from "react";

type Props = {
  clientId: string;
  createSession: (clientId: string, name?: string | null) => Promise<void>;
};

export function AddSessionButton({ clientId, createSession }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await createSession(clientId, name.trim() || null);
      setName("");
      setShowModal(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="btn-primary text-sm"
      >
        Add Session
      </button>
      {showModal && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-session-title"
          onClick={() => !isPending && (setShowModal(false), setName(""))}
        >
          <form
            onSubmit={handleSubmit}
            className="card w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="add-session-title" className="text-lg font-semibold text-[var(--text)]">
              New session
            </h2>
            <div>
              <label htmlFor="session-name" className="block text-sm font-medium text-[var(--text)] mb-1">
                Session name (optional)
              </label>
              <input
                id="session-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Push day"
                className="input py-1.5 text-sm"
                disabled={isPending}
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowModal(false); setName(""); }}
                disabled={isPending}
                className="btn-secondary text-sm py-1.5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="btn-primary text-sm py-1.5"
              >
                {isPending ? "Adding…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
