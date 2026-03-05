import { hash, compare } from "bcryptjs";

/** Trim and lowercase email for consistent lookups. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Hash password with bcrypt (cost 10). */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

/** Verify plain password against bcrypt hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return compare(password, hash);
}

/** Validate new password: min length >= 8. Returns error message or null if valid. */
export function validateNewPassword(password: string): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  return null;
}
