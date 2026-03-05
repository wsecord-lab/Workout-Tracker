"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { requireTrainer } from "@/lib/authz";
import {
  normalizeEmail,
  hashPassword,
  verifyPassword,
  validateNewPassword,
} from "@/lib/passwords";
import { validateClient } from "@/lib/validations";
import { Role } from "@prisma/client";

const TRAINER = Role.TRAINER;
const CLIENT = Role.CLIENT;

/** Basic email format check (has @ and domain). */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type CreateClientLoginResult =
  | { ok: true; clientId: string; userId: string }
  | { ok: false; errors: Record<string, string> };

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

/**
 * Trainer-only: Create a client login (User with role CLIENT) and link to an existing
 * Client or create a new Client. No SMTP; trainer sets temp password.
 */
export async function createClientLoginAndLink(
  formData: FormData
): Promise<CreateClientLoginResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, errors: { _: "You must be logged in." } };
  }
  const role = (session.user as { role?: Role }).role;
  if (role !== TRAINER) {
    return { ok: false, errors: { _: "Only trainers can create client logins." } };
  }

  const errors: Record<string, string> = {};
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const tempPassword = String(formData.get("tempPassword") ?? "");
  const linkMode = formData.get("linkMode") as string | null;
  const existingClientId = formData.get("existingClientId") as string | null;
  const newClientName = formData.get("newClientName") as string | null;

  if (!email) errors.email = "Email is required.";
  else if (!isValidEmail(email)) errors.email = "Please enter a valid email address.";
  const pwError = validateNewPassword(tempPassword);
  if (pwError) errors.tempPassword = pwError;

  if (linkMode !== "existing" && linkMode !== "new") {
    errors.linkMode = "Choose to link to an existing client or create a new one.";
  }

  if (linkMode === "existing") {
    if (!existingClientId?.trim()) errors.existingClientId = "Select a client to link.";
  }

  if (linkMode === "new") {
    if (!newClientName?.trim()) errors.newClientName = "Client name is required for new client.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // Find or create User (CLIENT)
  let user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    if (user.role === TRAINER) {
      return { ok: false, errors: { email: "Email already used by trainer account." } };
    }
    // existing CLIENT user — will link below
  } else {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(tempPassword),
        role: CLIENT,
      },
    });
  }

  // Enforce 1:1: one User (CLIENT) -> at most one Client
  const existingLink = await prisma.client.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });
  if (existingLink) {
    return {
      ok: false,
      errors: { _: "This user is already linked to a client." },
    };
  }

  let clientId: string;

  if (linkMode === "existing") {
    const clientIdVal = existingClientId!.trim();
    const client = await prisma.client.findUnique({
      where: { id: clientIdVal },
      select: { id: true, userId: true, trainerId: true },
    });
    if (!client) {
      return { ok: false, errors: { existingClientId: "Client not found." } };
    }
    if (client.trainerId != null && client.trainerId !== session.user.id) {
      return { ok: false, errors: { _: "You do not have access to this client." } };
    }
    if (client.userId != null) {
      return {
        ok: false,
        errors: { existingClientId: "This client is already linked to a user account." },
      };
    }
    await prisma.client.update({
      where: { id: clientIdVal },
      data: { userId: user.id },
    });
    clientId = clientIdVal;
  } else {
    // linkMode === "new": client fields optional except name (reuse validateClient)
    const clientResult = validateClient(
      {
        name: newClientName,
        age: formData.get("newClientAge"),
        heightFeet: formData.get("newClientHeightFeet"),
        heightInInches: formData.get("newClientHeightInInches"),
        bodyWeightLb: formData.get("newClientBodyWeightLb"),
      },
      { optionalFields: true }
    );
    if (!clientResult.ok) {
      const fieldMap: Record<string, string> = {
        name: "newClientName",
        age: "newClientAge",
        heightIn: "newClientHeightFeet",
        heightFeet: "newClientHeightFeet",
        heightInInches: "newClientHeightInInches",
        bodyWeightLb: "newClientBodyWeightLb",
      };
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(clientResult.errors)) {
        mapped[fieldMap[k] ?? k] = v;
      }
      return { ok: false, errors: mapped };
    }
    const client = await prisma.client.create({
      data: {
        ...clientResult.data,
        userId: user.id,
        trainerId: session.user.id,
        weightRecords: {
          create: { weightKg: clientResult.data.bodyWeightKg },
        },
      },
    });
    clientId = client.id;
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/clients");
  return { ok: true, clientId, userId: user.id };
}

/**
 * Change current user's password. Works for both TRAINER and CLIENT.
 */
export async function changeMyPassword(
  formData: FormData
): Promise<ChangePasswordResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, errors: { _: "You must be logged in." } };
  }

  const errors: Record<string, string> = {};
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!currentPassword) errors.currentPassword = "Current password is required.";
  const newPwError = validateNewPassword(newPassword);
  if (newPwError) errors.newPassword = newPwError;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true },
  });
  if (!user) {
    return { ok: false, errors: { _: "User not found." } };
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    return { ok: false, errors: { currentPassword: "Current password is incorrect." } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  revalidatePath("/");
  revalidatePath("/manage-account");
  revalidatePath("/manage-account/change-password");
  return { ok: true };
}

export type UnlinkedClient = { id: string; name: string };

/**
 * Trainer-only: List clients that have no linked user account (userId is null), for the current trainer.
 */
export async function listUnlinkedClients(): Promise<UnlinkedClient[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const role = (session.user as { role?: Role }).role;
  if (role !== TRAINER) return [];

  const clients = await prisma.client.findMany({
    where: { userId: null, trainerId: session.user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return clients;
}

export type ClientAccountRow = {
  userId: string;
  email: string;
  clientId: string | null;
  clientName: string | null;
};

/**
 * Trainer-only: List CLIENT users whose linked client is owned by this trainer.
 */
export async function listClientAccounts(): Promise<ClientAccountRow[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const role = (session.user as { role?: Role }).role;
  if (role !== TRAINER) return [];

  const clients = await prisma.client.findMany({
    where: { trainerId: session.user.id, userId: { not: null } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      user: { select: { id: true, email: true } },
    },
  });

  return clients.map((c) => ({
    userId: c.user!.id,
    email: c.user!.email,
    clientId: c.id,
    clientName: c.name,
  }));
}

/**
 * Trainer-only: Remove a client account (delete User). Client profile is unlinked (userId set to null).
 */
export async function removeClientAccount(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireTrainer();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true },
  });
  if (!user) return { ok: false, error: "User not found." };
  if (user.role !== CLIENT) return { ok: false, error: "Only client accounts can be removed." };
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/dashboard/manage-accounts");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Trainer-only: List clients owned by this trainer (id, name) for dropdowns.
 */
export async function listClientsBasic(): Promise<{ id: string; name: string }[]> {
  const user = await requireTrainer();
  return prisma.client.findMany({
    where: { trainerId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
