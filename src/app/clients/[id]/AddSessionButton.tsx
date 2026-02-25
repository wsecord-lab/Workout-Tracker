"use client";

import { useTransition } from "react";

type Props = {
  clientId: string;
  createSession: (clientId: string) => Promise<void>;
};

export function AddSessionButton({ clientId, createSession }: Props) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => {
        startTransition(async () => {
          await createSession(clientId);
        });
      }}
      disabled={isPending}
      className="btn-primary text-sm"
    >
      {isPending ? "Adding…" : "Add Session"}
    </button>
  );
}
