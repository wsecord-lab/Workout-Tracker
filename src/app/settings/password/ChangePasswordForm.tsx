"use client";

import { useState } from "react";
import { changeMyPassword } from "@/app/actions/accounts";
import { PasswordInput } from "@/components/PasswordInput";

export function ChangePasswordForm() {
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const newPassword = (formData.get("newPassword") as string) ?? "";
    const confirmPassword = (formData.get("confirmPassword") as string) ?? "";
    if (newPassword.length < 8) {
      setMessage({ type: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "New password and confirmation do not match." });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await changeMyPassword(formData);
      if (result.ok) {
        setMessage({ type: "success", text: "Password changed successfully." });
        form.reset();
      } else {
        const msg = result.errors._ ?? Object.values(result.errors).join(" ");
        setMessage({ type: "error", text: msg || "Failed to change password." });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      id="change-password-form"
      onSubmit={handleSubmit}
      className="mx-auto max-w-sm space-y-4 rounded border border-border bg-surface p-4"
    >
      <div>
        <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-[var(--text)]">
          Current password
        </label>
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          required
          autoComplete="current-password"
          className="input"
        />
      </div>
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
          aria-label="New password (at least 8 characters)"
        />
        <p className="mt-0.5 text-xs text-muted">At least 8 characters</p>
      </div>
      <div>
        <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-[var(--text)]">
          Confirm new password
        </label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          required
          autoComplete="new-password"
          className="input"
          aria-label="Confirm new password"
        />
      </div>
      {message && (
        <p
          role="alert"
          className={`rounded px-3 py-2 text-sm ${
            message.type === "success"
              ? "bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]"
              : "bg-[color-mix(in_srgb,var(--error)_15%,transparent)] text-[var(--error)]"
          }`}
        >
          {message.text}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
        {isSubmitting ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
