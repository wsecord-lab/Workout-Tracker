import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">Reset password</h1>
      <p className="mb-6 text-sm text-muted">Choose a new password for your account.</p>
      <ResetPasswordForm token={token?.trim() ?? ""} />
    </div>
  );
}
