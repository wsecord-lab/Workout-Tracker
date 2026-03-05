import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { ChangePasswordForm } from "@/app/settings/password/ChangePasswordForm";

export default async function ChangePasswordPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/manage-account"
          className="text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded btn-secondary text-sm py-1.5"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-[var(--text)]">Change password</h1>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
