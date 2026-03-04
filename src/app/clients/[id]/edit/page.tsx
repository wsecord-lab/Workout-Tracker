import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { updateClient } from "@/app/actions/clients";
import { deleteClient } from "@/app/actions/clients";
import { ClientForm } from "@/app/clients/ClientForm";
import { DeleteClientButton } from "@/app/clients/DeleteClientButton";
import { LinkClientAccount } from "@/app/clients/[id]/LinkClientAccount";
import { LogoutButton } from "@/components/LogoutButton";
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
      <div className="mb-6 flex items-center justify-between">
        <div className={`flex items-center gap-4 ${isClient ? "flex-1 min-w-0" : ""}`}>
          <Link
            href={`/clients/${id}`}
            className="text-secondary hover:text-secondary-hover hover:underline outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
          >
            ← {client.name}
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text)]">Edit Client</h1>
        </div>
        {isClient && (
          <div className="shrink-0 ml-4">
            <LogoutButton variant="primary" />
          </div>
        )}
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
      {user.role === "TRAINER" && (
        <LinkClientAccount clientId={id} />
      )}
      <div className="mt-6">
        <DeleteClientButton clientId={id} clientName={client.name} />
      </div>
    </div>
  );
}
