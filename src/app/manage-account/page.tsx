import Link from "next/link";
import { requireUser, getClientIdForCurrentUser } from "@/lib/authz";

export default async function ManageAccountPage() {
  const user = await requireUser();
  const clientId = user.role === "CLIENT" ? await getClientIdForCurrentUser() : null;
  const backHref = clientId ? `/clients/${clientId}` : "/dashboard";

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link
          href={backHref}
          className="text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded btn-secondary text-sm py-1.5"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-[var(--text)]">
          Manage Account
        </h1>
      </div>

      <section className="card max-w-lg">
        <h2 className="mb-2 text-lg font-semibold text-[var(--text)]">
          Security
        </h2>
        <p className="mb-3 text-sm text-muted">
          Update your password or other security settings.
        </p>
        <Link
          href="/manage-account/change-password"
          className="btn-primary inline-block text-sm"
        >
          Change Password
        </Link>
      </section>
    </div>
  );
}
