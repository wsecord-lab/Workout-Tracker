"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/accounts";

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    await requestPasswordReset(formData);
    setSubmitted(true);
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="space-y-4 rounded border border-border bg-surface p-4">
        <p className="text-sm text-[var(--text)]" role="status">
          Ask your trainer to set a new temporary password for your account. After they
          do, sign in and you will be prompted to choose your own password.
        </p>
        <Link href="/login" className="btn-primary inline-block text-sm">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded border border-border bg-surface p-4"
    >
      <p className="text-sm text-muted">
        This app does not send reset emails. Enter your username so we can show the next
        steps — your trainer will need to help you get back in.
      </p>
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
      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? "Submitting…" : "Continue"}
      </button>
      <p className="text-center text-sm text-muted">
        <Link href="/login" className="text-secondary hover:text-secondary-hover hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
