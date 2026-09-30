import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string }>;
}) {
  const { required } = await searchParams;
  const forced = required === "1";
  await requireUser({ allowPasswordChange: true });

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center gap-4">
        {!forced && (
          <Link
            href="/manage-account"
            className="text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded btn-secondary text-sm py-1.5"
          >
            ← Back
          </Link>
        )}
        <h1 className="text-2xl font-bold text-[var(--text)]">
          {forced ? "Set a new password" : "Change password"}
        </h1>
      </div>
      {forced && (
        <p className="mb-4 text-sm text-muted">
          Your trainer set a temporary password. Choose a new one to continue.
        </p>
      )}
      <ChangePasswordForm forced={forced} />
    </div>
  );
}
