"use client";

import { useState, useTransition } from "react";
import { linkUserToClient } from "@/app/actions/clients";
import { useToast } from "@/components/ui/toast/use-toast";

export function LinkClientAccount({
  clientId,
}: {
  clientId: string;
}) {
  const { addToast } = useToast();
  const [username, setUsername] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await linkUserToClient(clientId, username);
      if (result.ok) {
        addToast("success", "Client account linked.");
        setUsername("");
        return;
      }
      addToast("error", result.error);
    });
  }

  return (
    <div className="mt-6 rounded border border-border bg-surface p-4">
      <h3 className="mb-2 font-medium text-[var(--text)]">Link client account</h3>
      <p className="mb-3 text-sm text-muted">
        Link this client profile to a user account (by username) so they can sign in and view their own data.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="link-username" className="sr-only">Username</label>
          <input
            id="link-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="input py-1.5 text-sm"
            disabled={isPending}
            required
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary text-sm py-1.5 inline-flex items-center gap-2"
        >
          {isPending && (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
          )}
          {isPending ? "Linking…" : "Link account"}
        </button>
      </form>
    </div>
  );
}
