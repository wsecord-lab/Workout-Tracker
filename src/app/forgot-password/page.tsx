import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">Forgot password</h1>
      <p className="mb-6 text-sm text-muted">
        Get help signing in when you cannot remember your password.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
