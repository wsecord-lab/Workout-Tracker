import Link from "next/link";
import { requireUser, getClientIdForCurrentUser } from "@/lib/authz";

export default async function ManageAccountPage() {
  const user = await requireUser();
  const isClient = user.role === "CLIENT";
  const clientId = isClient ? await getClientIdForCurrentUser() : null;
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
          {isClient ? "Your Account" : "Manage Account"}
        </h1>
      </div>

      {isClient ? (
        <>
          <p className="mb-6 max-w-lg text-sm text-muted">
            Update your sign-in password here. Profile details (name, height, weight) are
            managed with your trainer — they appear on your workout page.
          </p>
          <section className="card max-w-lg">
            <h2 className="mb-2 text-lg font-semibold text-[var(--text)]">Password</h2>
            <p className="mb-3 text-sm text-muted">
              Choose a password only you know. If you forget it, ask your trainer to set a
              temporary one.
            </p>
            <Link
              href="/manage-account/change-password"
              className="btn-primary inline-block text-sm"
            >
              Change Password
            </Link>
          </section>
          {clientId && (
            <p className="mt-6 text-sm text-muted">
              <Link
                href={`/clients/${clientId}`}
                className="text-secondary hover:text-secondary-hover hover:underline"
              >
                ← Back to your workouts
              </Link>
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mb-6 max-w-lg text-sm text-muted">
            Manage your trainer sign-in. To create or link client logins, use{" "}
            <Link
              href="/dashboard/manage-accounts"
              className="text-secondary hover:text-secondary-hover hover:underline"
            >
              Manage Client Accounts
            </Link>
            .
          </p>
          <section className="card max-w-lg">
            <h2 className="mb-2 text-lg font-semibold text-[var(--text)]">Security</h2>
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
        </>
      )}
    </div>
  );
}
