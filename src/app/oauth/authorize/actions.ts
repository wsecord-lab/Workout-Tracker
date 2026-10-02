"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { checkAuthorizeRequest, createAuthorizationCode } from "../../../../mcp/src/oauth";

function str(f: FormData, k: string): string | undefined {
  const v = f.get(k);
  return typeof v === "string" ? v : undefined;
}

/** Runs when the person clicks Allow or Deny. Re-checks everything; the hidden form fields are not trusted. */
export async function decideAuthorization(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const check = await checkAuthorizeRequest({
    response_type: str(formData, "response_type"),
    client_id: str(formData, "client_id"),
    redirect_uri: str(formData, "redirect_uri"),
    code_challenge: str(formData, "code_challenge"),
    code_challenge_method: str(formData, "code_challenge_method"),
    state: str(formData, "state"),
  });
  if (!check.ok) redirect("/");

  const target = new URL(check.redirectUri);
  if (check.state) target.searchParams.set("state", check.state);

  if (str(formData, "decision") !== "allow") {
    target.searchParams.set("error", "access_denied");
    redirect(target.toString());
  }

  const code = await createAuthorizationCode({
    userId: session.user.id,
    clientId: check.clientId,
    redirectUri: check.redirectUri,
    codeChallenge: check.codeChallenge,
  });
  target.searchParams.set("code", code);
  redirect(target.toString());
}
