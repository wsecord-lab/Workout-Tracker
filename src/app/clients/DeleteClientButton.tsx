"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteClient } from "@/app/actions/clients";

export function DeleteClientButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await deleteClient(clientId);
    router.push("/");
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded border border-error/40 bg-error/10 px-4 py-2 text-sm text-error outline-none hover:bg-error/20 focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        Delete client
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">
        Delete “{clientName}”? This cannot be undone.
      </span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="rounded bg-error px-4 py-2 text-sm text-white outline-none hover:bg-error-hover focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="btn-secondary text-sm"
      >
        Cancel
      </button>
    </div>
  );
}
