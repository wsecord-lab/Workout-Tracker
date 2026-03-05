import Link from "next/link";
import { listUnlinkedClients, listClientAccounts } from "@/app/actions/accounts";
import { ManageAccounts } from "@/components/ManageAccounts";
import { requireTrainer } from "@/lib/authz";

export default async function ManageAccountsPage() {
  await requireTrainer();

  const [unlinkedClients, clientAccounts] = await Promise.all([
    listUnlinkedClients(),
    listClientAccounts(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/dashboard"
          className="text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded btn-secondary text-sm py-1.5"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-[var(--text)]">
          Manage Client Accounts
        </h1>
      </div>
      <ManageAccounts
        unlinkedClients={unlinkedClients}
        clientAccounts={clientAccounts}
      />
    </div>
  );
}
