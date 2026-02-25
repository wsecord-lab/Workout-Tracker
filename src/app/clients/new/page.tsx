import Link from "next/link";
import { createClient } from "@/app/actions/clients";
import { ClientForm } from "@/app/clients/ClientForm";

export default function NewClientPage() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/"
          className="text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
        >
          ← Clients
        </Link>
        <h1 className="text-2xl font-bold text-[var(--text)]">New Client</h1>
      </div>
      <ClientForm action={createClient} />
    </div>
  );
}
