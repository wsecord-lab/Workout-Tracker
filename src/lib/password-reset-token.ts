import { createHash, randomBytes } from "crypto";

/** Generate an opaque reset token (returned to the user once; store only the hash). */
export function generatePasswordResetToken(): string {
  return randomBytes(32).toString("hex");
}

/** Hash a reset token for storage/lookup. */
export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
