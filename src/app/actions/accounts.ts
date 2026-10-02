"use server";

import { revalidatePath } from "next/cache";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/db";
import { requireTrainer } from "@/lib/authz";
import {
  hashPassword,
  verifyPassword,
  validateNewPassword,
} from "@/lib/passwords";
import { hashPasswordResetToken } from "@/lib/password-reset-token";
import { validateClient } from "@/lib/validations";
import { Role } from "@prisma/client";

const TRAINER = Role.TRAINER;
const CLIENT = Role.CLIENT;

/**
 * After any password change: every sign-in issued under the old password stops
 * working (sessionVersion), and AI apps connected via sign-in are disconnected.
 * Keys created by hand with scripts/create-api-key.ts are left alone.
 */
const END_EXISTING_SIGN_INS = { sessionVersion: { increment: 1 } } as const;

function revokeAppSignIns(userId: string) {
  return prisma.apiKey.updateMany({
    where: { userId, oauthClientId: { not: null }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Normalize username for lookups (trim + lowercase). */
function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export type CreateClientLoginResult =
  | { ok: true; clientId: string; userId: string }
  | { ok: false; errors: Record<string, string> };

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

export type RequestPasswordResetResult = { ok: true };

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

/**
 * Trainer-only: Create a client login (User with role CLIENT) and link to an existing
 * Client or create a new Client. No SMTP; trainer sets temp password.
 * New/updated credentials require a password change on next sign-in (mustChangePassword).
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
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const tempPassword = String(formData.get("tempPassword") ?? "");
  const linkMode = formData.get("linkMode") as string | null;
  const existingClientId = formData.get("existingClientId") as string | null;
  const newClientName = formData.get("newClientName") as string | null;

  if (!username) errors.username = "Username is required.";
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

  // Check the target client before touching any account, so a failed link
  // never leaves someone's password changed.
  if (linkMode === "existing") {
    const client = await prisma.client.findUnique({
      where: { id: existingClientId!.trim() },
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
  }

  const passwordHash = await hashPassword(tempPassword);

  // Find or create User (CLIENT) — username stored in email column
  let user = await prisma.user.findUnique({ where: { email: username } });
  if (user) {
    if (user.role === TRAINER) {
      return { ok: false, errors: { username: "Username already used by trainer account." } };
    }
    // Enforce 1:1 before applying a new temp password
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
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        ...END_EXISTING_SIGN_INS,
      },
    });
    await revokeAppSignIns(user.id);
  } else {
    user = await prisma.user.create({
      data: {
        email: username,
        passwordHash,
        role: CLIENT,
        mustChangePassword: true,
      },
    });
  }

  let clientId: string;

  if (linkMode === "existing") {
    const clientIdVal = existingClientId!.trim();
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
 * Clears mustChangePassword after a successful change.
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
    select: { id: true, email: true, passwordHash: true },
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
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      ...END_EXISTING_SIGN_INS,
    },
  });
  await revokeAppSignIns(user.id);

  // That signed out every device, including this one; sign this one back in with the new password.
  try {
    await signIn("credentials", { username: user.email, password: newPassword, redirect: false });
  } catch {
    // Worst case they land on the login page and sign in with the new password.
  }

  revalidatePath("/");
  revalidatePath("/manage-account");
  revalidatePath("/manage-account/change-password");
  return { ok: true };
}

/**
 * Acknowledge a forgot-password request without revealing whether the username exists.
 * No SMTP in this app — clients should ask their trainer for a temporary password.
 * Token-based resets use createPasswordResetTokenForUser + resetPasswordWithToken.
 */
export async function requestPasswordReset(
  _formData: FormData
): Promise<RequestPasswordResetResult> {
  return { ok: true };
}

/**
 * Reset password using a one-time PasswordResetToken. Clears mustChangePassword.
 */
export async function resetPasswordWithToken(
  formData: FormData
): Promise<ResetPasswordResult> {
  const errors: Record<string, string> = {};
  const token = String(formData.get("token") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) errors.token = "Reset link is invalid or expired.";
  const newPwError = validateNewPassword(newPassword);
  if (newPwError) errors.newPassword = newPwError;
  if (newPassword !== confirmPassword) {
    errors.confirmPassword = "New password and confirmation do not match.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const tokenHash = hashPasswordResetToken(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { token: tokenHash },
    select: { id: true, userId: true, expiresAt: true, used: true },
  });
  if (!record || record.used || record.expiresAt.getTime() < Date.now()) {
    return { ok: false, errors: { token: "Reset link is invalid or expired." } };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        ...END_EXISTING_SIGN_INS,
      },
    }),
    revokeAppSignIns(record.userId),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { used: true },
    }),
  ]);

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
  const trainer = await requireTrainer();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true },
  });
  if (!user) return { ok: false, error: "User not found." };
  if (user.role !== CLIENT) return { ok: false, error: "Only client accounts can be removed." };
  // Only the trainer whose client this login belongs to may remove it.
  const owned = await prisma.client.findFirst({
    where: { userId: user.id, trainerId: trainer.id },
    select: { id: true },
  });
  if (!owned) return { ok: false, error: "User not found." };
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
