"use client";

import { useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { signInAction } from "./login-action";

type Props = { errorFromUrl?: string };

export function LoginForm({ errorFromUrl }: Props) {
  const [error, setError] = useState<string | null>(errorFromUrl ?? null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const result = await signInAction(formData);
    if (result.ok) {
      window.location.href = "/auth/redirect";
      return;
    }
    setError(result.error);
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded border border-border bg-surface p-4">
      {(errorFromUrl || error) && (
        <p
          className="rounded border border-[var(--error)] bg-[color-mix(in_srgb,var(--error)_12%,transparent)] px-4 py-3 text-sm text-[var(--error)]"
          role="alert"
        >
          {error ?? errorFromUrl}
        </p>
      )}
      <div>
        <label htmlFor="username" className="mb-1 block text-sm font-medium text-[var(--text)]">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          className="input"
          disabled={submitting}
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-[var(--text)]">
          Password
        </label>
        <PasswordInput
          id="password"
          name="password"
          required
          autoComplete="current-password"
          className="input"
        />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm text-muted">
        <a
          href="/forgot-password"
          className="text-secondary hover:text-secondary-hover hover:underline"
        >
          Forgot password?
        </a>
      </p>
    </form>
  );
}
