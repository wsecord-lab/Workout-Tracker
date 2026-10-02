"use server";

import { CredentialsSignin } from "next-auth";
import { signIn, TooManyLoginAttempts } from "@/auth";

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function signInAction(formData: FormData): Promise<LoginResult> {
  try {
    const result = await signIn("credentials", {
      username: (formData.get("username") as string)?.trim()?.toLowerCase() ?? "",
      password: (formData.get("password") as string) ?? "",
      redirect: false,
    });
    if (result?.error) {
      return { ok: false, error: "Invalid username or password." };
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof CredentialsSignin && e.code === "rate_limited") {
      const minutes = e instanceof TooManyLoginAttempts ? e.retryAfterMinutes : 15;
      return {
        ok: false,
        error: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or ask your trainer to reset your password.`,
      };
    }
    return { ok: false, error: "Invalid username or password." };
  }
}
