"use server";

import { signIn } from "@/auth";

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function signInAction(formData: FormData): Promise<LoginResult> {
  try {
    const result = await signIn("credentials", {
      email: (formData.get("email") as string)?.trim()?.toLowerCase() ?? "",
      password: (formData.get("password") as string) ?? "",
      redirect: false,
    });
    if (result?.error) {
      return { ok: false, error: "Invalid email or password." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Invalid email or password." };
  }
}
