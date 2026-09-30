import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { updateClient } from "@/app/actions/clients";
import { ClientForm } from "@/app/clients/ClientForm";
import { DeleteClientButton } from "@/app/clients/DeleteClientButton";
import { LinkClientAccount } from "@/app/clients/[id]/LinkClientAccount";
import { requireUser, assertClientAccess } from "@/lib/authz";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await assertClientAccess(id);
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();
  const boundUpdate = updateClient.bind(null, id);
  const isClient = user.role === "CLIENT";
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link
          href={`/clients/${id}`}
          className="text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
        >
          ← {client.name}
        </Link>
        <h1 className="text-2xl font-bold text-[var(--text)]">Edit Client</h1>
      </div>
      <ClientForm
        action={boundUpdate}
        initial={{
          name: client.name,
          age: client.age,
          heightCm: client.heightCm,
          bodyWeightKg: client.bodyWeightKg,
        }}
        clientId={id}
        successRedirect={`/clients/${id}`}
      />
      {isClient && (
        <div className="mt-6 card max-w-md">
          <h2 className="mb-2 text-lg font-semibold text-[var(--text)]">Security</h2>
          <p className="mb-3 text-sm text-muted">
            Update your password to keep your account secure.
          </p>
          <Link href="/manage-account/change-password" className="btn-primary inline-block text-sm">
            Change password
          </Link>
        </div>
      )}
      {user.role === "TRAINER" && (
        <LinkClientAccount clientId={id} />
      )}
      {user.role === "TRAINER" && (
        <div className="mt-6">
          <DeleteClientButton clientId={id} clientName={client.name} />
        </div>
      )}
    </div>
  );
}
