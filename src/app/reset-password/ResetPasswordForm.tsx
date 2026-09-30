"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resetPasswordWithToken } from "@/app/actions/accounts";
import { PasswordInput } from "@/components/PasswordInput";

type Props = { token: string };

function validateNewPassword(value: string): string | null {
  if (typeof value !== "string" || value.length < 8) {
    return "New password must be at least 8 characters.";
  }
  return null;
}

export function ResetPasswordForm({ token }: Props) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("token", token);
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    const nextErrors: Record<string, string> = {};
    const newErr = validateNewPassword(newPassword);
    if (newErr) nextErrors.newPassword = newErr;
    if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = "New password and confirmation do not match.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await resetPasswordWithToken(formData);
      if (result.ok) {
        setDone(true);
        setTimeout(() => router.push("/login"), 1500);
      } else {
        setErrors(result.errors);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <p className="rounded border border-border bg-surface p-4 text-sm text-[var(--text)]" role="status">
        Password updated. Redirecting to sign in…
      </p>
    );
  }

  if (!token) {
    return (
      <div className="space-y-3 rounded border border-border bg-surface p-4">
        <p className="text-sm text-error" role="alert">
          Reset link is invalid or expired.
        </p>
        <Link href="/forgot-password" className="text-sm text-secondary hover:underline">
          Request help again
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded border border-border bg-surface p-4"
    >
      {errors.token && (
        <p className="text-sm text-error" role="alert">
          {errors.token}
        </p>
      )}
      {errors._ && (
        <p className="text-sm text-error" role="alert">
          {errors._}
        </p>
      )}
      <div>
        <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-[var(--text)]">
          New password
        </label>
        <PasswordInput
          id="newPassword"
          name="newPassword"
          required
          autoComplete="new-password"
          className="input"
        />
        <p className="mt-0.5 text-xs text-muted">At least 8 characters</p>
        {errors.newPassword && (
          <p className="mt-1 text-sm text-error" role="alert">
            {errors.newPassword}
          </p>
        )}
      </div>
      <div>
        <label
          htmlFor="confirmPassword"
          className="mb-1 block text-sm font-medium text-[var(--text)]"
        >
          Confirm new password
        </label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          required
          autoComplete="new-password"
          className="input"
        />
        {errors.confirmPassword && (
          <p className="mt-1 text-sm text-error" role="alert">
            {errors.confirmPassword}
          </p>
        )}
      </div>
      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? "Saving…" : "Set new password"}
      </button>
      <p className="text-center text-sm text-muted">
        <Link href="/login" className="text-secondary hover:text-secondary-hover hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
