import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { checkAuthorizeRequest } from "../../../../mcp/src/oauth";
import { decideAuthorization } from "./actions";

type Params = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export const dynamic = "force-dynamic";

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const params = {
    response_type: first(sp.response_type),
    client_id: first(sp.client_id),
    redirect_uri: first(sp.redirect_uri),
    code_challenge: first(sp.code_challenge),
    code_challenge_method: first(sp.code_challenge_method),
    state: first(sp.state),
  };

  const check = await checkAuthorizeRequest(params);
  if (!check.ok) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="mb-4 text-2xl font-bold text-[var(--text)]">Can’t connect</h1>
        <p className="rounded border border-border bg-surface p-4 text-sm text-[var(--text)]">{check.message}</p>
      </div>
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    const back = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) back.set(k, v);
    redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/authorize?${back.toString()}`)}`);
  }

  if (session.user.mustChangePassword) redirect("/manage-account/change-password?required=1");

  const user = session.user as { email?: string | null; name?: string | null; role?: string };
  const appName = check.clientName ?? "An AI app";

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-2xl font-bold text-[var(--text)]">Connect {appName}?</h1>
      <div className="space-y-4 rounded border border-border bg-surface p-4">
        <p className="text-sm text-[var(--text)]">
          <strong>{appName}</strong> wants to use your Workout Tracker account
          {user.email ? <> (<strong>{user.email}</strong>)</> : null}.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            {user.role === "TRAINER"
              ? "See your clients, their workouts, and progress."
              : "See your own workouts and progress."}
          </li>
          <li>Plan and edit upcoming workouts. Finished workouts are protected.</li>
          <li>It cannot delete anything, and every change it makes can be undone.</li>
        </ul>
        <p className="text-xs text-muted">
          After approving, you’ll be sent back to <strong>{check.redirectHost}</strong>. Only continue
          if you started this from an app you trust.
        </p>
        <form action={decideAuthorization} className="flex gap-3">
          <input type="hidden" name="response_type" value="code" />
          <input type="hidden" name="client_id" value={check.clientId} />
          <input type="hidden" name="redirect_uri" value={check.redirectUri} />
          <input type="hidden" name="code_challenge" value={check.codeChallenge} />
          <input type="hidden" name="code_challenge_method" value="S256" />
          {check.state ? <input type="hidden" name="state" value={check.state} /> : null}
          <button type="submit" name="decision" value="allow" className="btn-primary flex-1">
            Allow
          </button>
          <button type="submit" name="decision" value="deny" className="btn-secondary flex-1">
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
