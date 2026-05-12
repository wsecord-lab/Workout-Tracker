"use client";

import { useState, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { createSessionWithTemplate } from "@/app/actions/sessions";
import { listTemplates } from "@/app/actions/templates";

const MODAL_BACKDROP_Z = 1000;
const MODAL_PANEL_Z = 1001;

type Props = {
  clientId: string;
  createSession: (clientId: string, name?: string | null, calendarDateKey?: string | null) => Promise<void>;
  className?: string;
  /** When true, show the Start-From-Template selector. Trainer-only feature. */
  canUseTemplates?: boolean;
};

export function AddSessionButton({
  clientId,
  createSession,
  className = "",
  canUseTemplates = false,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!showModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showModal]);

  useEffect(() => {
    if (!showModal || !canUseTemplates) return;
    listTemplates(false).then((result) => {
      if (result.ok) {
        setTemplates(result.templates.map((t) => ({ id: t.id, name: t.name })));
      } else {
        setTemplates([]);
      }
    });
  }, [showModal, canUseTemplates]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    startTransition(async () => {
      if (canUseTemplates && templateId.trim()) {
        const result = await createSessionWithTemplate(
          clientId,
          name.trim() || null,
          templateId
        );
        if (!result.ok) {
          setSubmitError(result.error ?? "Failed to create session");
          return;
        }
      } else {
        await createSession(clientId, name.trim() || null);
      }
      setName("");
      setTemplateId("");
      setShowModal(false);
    });
  }

  function closeModal() {
    if (!isPending) {
      setShowModal(false);
      setName("");
      setTemplateId("");
      setSubmitError(null);
    }
  }

  const modal = showModal && typeof document !== "undefined" && createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/50"
      style={{ zIndex: MODAL_BACKDROP_Z }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-session-title"
      onClick={closeModal}
    >
      <form
        onSubmit={handleSubmit}
        className="card w-full max-w-sm space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ zIndex: MODAL_PANEL_Z }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-session-title" className="text-lg font-semibold text-[var(--text)]">
          New Session
        </h2>
        <div>
          <label htmlFor="session-name" className="block text-sm font-medium text-[var(--text)] mb-1">
            Session Name
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
        {canUseTemplates && (
          <div>
            <label htmlFor="session-template" className="block text-sm font-medium text-[var(--text)] mb-1">
              Start From Template
            </label>
            <select
              id="session-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="input w-full py-1.5 text-sm"
              disabled={isPending}
            >
              <option value="">No template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Adds exercises from the template in order. No sets are added.
            </p>
          </div>
        )}
        {submitError && (
          <p className="text-sm text-error" role="alert">
            {submitError}
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={closeModal}
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
    </div>,
    document.body
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={`btn-primary text-sm ${className}`.trim()}
      >
        Add Session
      </button>
      {modal}
    </>
  );
}
