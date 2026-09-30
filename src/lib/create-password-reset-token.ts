import { prisma } from "@/lib/db";
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from "@/lib/password-reset-token";

/** Password reset tokens expire after 1 hour. */
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Create a password reset token for a known user id.
 * Returns the raw token once; only the hash is stored.
 */
export async function createPasswordResetTokenForUser(
  userId: string
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return { ok: false, error: "User not found." };

  const rawToken = generatePasswordResetToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token: hashPasswordResetToken(rawToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
    },
  });
  return { ok: true, token: rawToken };
}
