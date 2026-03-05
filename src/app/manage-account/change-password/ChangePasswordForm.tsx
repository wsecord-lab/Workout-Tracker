"use client";

import { useState, useRef, useEffect } from "react";
import { changeMyPassword } from "@/app/actions/accounts";
import { PasswordInput } from "@/components/PasswordInput";

const STICKY_HEADER_OFFSET = 80;

function scrollToField(element: HTMLElement | null) {
  if (!element) return;
  element.style.scrollMarginTop = `${STICKY_HEADER_OFFSET}px`;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  const input = element.querySelector<HTMLInputElement>("input");
  if (input) setTimeout(() => input.focus(), 350);
}

function validateNewPassword(value: string): string | null {
  if (typeof value !== "string" || value.length < 8) return "New password must be at least 8 characters.";
  return null;
}

function validateConfirm(confirm: string, newPw: string): string | null {
  if (confirm !== newPw) return "New password and confirmation do not match.";
  return null;
}

export function ChangePasswordForm() {
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const currentPasswordRef = useRef<HTMLDivElement>(null);
  const newPasswordRef = useRef<HTMLDivElement>(null);
  const confirmPasswordRef = useRef<HTMLDivElement>(null);

  // Clear field errors as soon as the field becomes valid (onChange/onBlur)
  useEffect(() => {
    const form = formRef.current;
    if (!form) return; // ref is set after mount
    const handleInput = () => {
      const fd = new FormData(form);
      const current = (fd.get("currentPassword") as string) ?? "";
      const newPw = (fd.get("newPassword") as string) ?? "";
      const confirm = (fd.get("confirmPassword") as string) ?? "";
      setMessage((prev) => (prev?.type === "error" ? null : prev));
      setErrors((prev) => {
        const next = { ...prev };
        if (prev.currentPassword && current.trim().length > 0) delete next.currentPassword;
        if (prev.newPassword && !validateNewPassword(newPw)) delete next.newPassword;
        if (prev.confirmPassword && !validateConfirm(confirm, newPw)) delete next.confirmPassword;
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    };
    form.addEventListener("input", handleInput);
    form.addEventListener("change", handleInput);
    form.addEventListener("blur", handleInput, true);
    return () => {
      form.removeEventListener("input", handleInput);
      form.removeEventListener("change", handleInput);
      form.removeEventListener("blur", handleInput, true);
    };
  }, []);

  const fieldRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    currentPassword: currentPasswordRef,
    newPassword: newPasswordRef,
    confirmPassword: confirmPasswordRef,
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setErrors({});
    const form = e.currentTarget;
    const formData = new FormData(form);
    const currentPassword = (formData.get("currentPassword") as string) ?? "";
    const newPassword = (formData.get("newPassword") as string) ?? "";
    const confirmPassword = (formData.get("confirmPassword") as string) ?? "";

    const nextErrors: Record<string, string> = {};
    if (!currentPassword.trim()) nextErrors.currentPassword = "Current password is required.";
    const newErr = validateNewPassword(newPassword);
    if (newErr) nextErrors.newPassword = newErr;
    const confirmErr = validateConfirm(confirmPassword, newPassword);
    if (confirmErr) nextErrors.confirmPassword = confirmErr;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const firstKey = ["currentPassword", "newPassword", "confirmPassword"].find((k) => nextErrors[k]);
      if (firstKey && fieldRefs[firstKey]?.current) scrollToField(fieldRefs[firstKey].current!);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await changeMyPassword(formData);
      if (result.ok) {
        setMessage({ type: "success", text: "Password changed successfully." });
        setErrors({});
        form.reset();
      } else {
        const serverErrors = result.errors;
        setErrors(serverErrors);
        const firstKey = ["currentPassword", "newPassword", "confirmPassword"].find((k) => serverErrors[k]);
        if (firstKey && fieldRefs[firstKey]?.current) scrollToField(fieldRefs[firstKey].current!);
        const general = serverErrors._;
        setMessage(general ? { type: "error", text: general } : null);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      ref={formRef}
      id="change-password-form"
      onSubmit={handleSubmit}
      className="mx-auto max-w-sm space-y-4 rounded border border-border bg-surface p-4"
    >
      <div
        id="field-currentPassword"
        ref={currentPasswordRef}
        className="scroll-mt-[var(--header-offset,80px)]"
        style={{ scrollMarginTop: STICKY_HEADER_OFFSET }}
      >
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
        {errors.currentPassword && (
          <p id="currentPassword-error" className="mt-1 text-sm text-error" role="alert">
            {errors.currentPassword}
          </p>
        )}
      </div>

      <div
        id="field-newPassword"
        ref={newPasswordRef}
        className="scroll-mt-[var(--header-offset,80px)]"
        style={{ scrollMarginTop: STICKY_HEADER_OFFSET }}
      >
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
        {errors.newPassword && (
          <p id="newPassword-error" className="mt-1 text-sm text-error" role="alert">
            {errors.newPassword}
          </p>
        )}
      </div>

      <div
        id="field-confirmPassword"
        ref={confirmPasswordRef}
        className="scroll-mt-[var(--header-offset,80px)]"
        style={{ scrollMarginTop: STICKY_HEADER_OFFSET }}
      >
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
        {errors.confirmPassword && (
          <p id="confirmPassword-error" className="mt-1 text-sm text-error" role="alert">
            {errors.confirmPassword}
          </p>
        )}
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

/*
  Manual QA checklist (Change Password):
  [ ] Submit with empty current password → error under field, scroll + focus to it
  [ ] Submit with new password < 8 chars → error under new password, scroll + focus
  [ ] Submit with non-matching confirm → error under confirm, scroll + focus
  [ ] Fix new password to ≥8 chars (onChange) → new password error clears immediately
  [ ] Fix confirm to match new (onChange) → confirm error clears immediately
  [ ] Type in current password after error → current password error clears immediately
  [ ] Submit with wrong current password → server error on current password, scroll + focus
  [ ] Sticky header: first invalid field scrolls into view with offset (no overlap)
  [ ] Success: form resets, success message shows; no stuck errors
*/
