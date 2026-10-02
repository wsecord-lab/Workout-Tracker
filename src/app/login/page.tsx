import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { safeCallbackUrl } from "./callback-url";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const next = safeCallbackUrl(callbackUrl);

  const session = await auth();
  if (session?.user) {
    redirect(next ?? "/auth/redirect");
  }

  const errorMessage = error === "CredentialsSignin" ? "Invalid username or password." : error;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold text-[var(--text)]">Sign in</h1>
      <LoginForm errorFromUrl={errorMessage} next={next ?? undefined} />
    </div>
  );
}
