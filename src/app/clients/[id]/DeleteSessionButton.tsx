"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteSession } from "@/app/actions/sessions";

export function DeleteSessionButton({
  sessionId,
  clientId,
  dateStr,
  hasContent,
}: {
  sessionId: string;
  clientId: string;
  dateStr: string;
  hasContent: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await deleteSession(sessionId, clientId);
    router.refresh();
  }

  function handleClick() {
    if (hasContent) {
      setConfirming(true);
    } else {
      handleDelete();
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={deleting}
        className="text-sm text-error hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded disabled:opacity-50"
      >
        {deleting ? "Removing…" : "Remove session"}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">
        Are you sure you want to delete the session from {dateStr}?
      </span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="rounded bg-error px-3 py-1.5 text-sm text-white outline-none hover:bg-error-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="btn-secondary text-sm py-1.5"
      >
        Cancel
      </button>
    </div>
  );
}
