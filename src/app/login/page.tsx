import { auth, signIn } from "@/auth";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    return (
      <div className="rounded border border-border bg-surface p-4">
        <p className="text-[var(--text)]">You are signed in as {session.user.email}.</p>
        <form
          action={async () => {
            "use server";
            const { signOut } = await import("@/auth");
            await signOut({ redirectTo: "/login" });
          }}
          className="mt-4"
        >
          <button type="submit" className="btn-secondary text-sm">
            Sign out
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold text-[var(--text)]">Sign in</h1>
      <form
        action={async (formData: FormData) => {
          "use server";
          await signIn("credentials", {
            email: formData.get("email") as string,
            password: formData.get("password") as string,
            redirectTo: "/",
          });
        }}
        className="space-y-4 rounded border border-border bg-surface p-4"
      >
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--text)]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="input"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-[var(--text)]">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="input"
          />
        </div>
        <button type="submit" className="btn-primary w-full">
          Sign in
        </button>
      </form>
    </div>
  );
}
