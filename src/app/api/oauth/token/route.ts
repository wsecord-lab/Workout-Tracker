import { exchangeAuthorizationCode, OAuthError, refreshTokens } from "../../../../../mcp/src/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };

function field(form: FormData | Record<string, unknown>, key: string): string | null {
  const v = form instanceof FormData ? form.get(key) : form[key];
  return typeof v === "string" && v ? v : null;
}

export async function POST(req: Request) {
  try {
    const type = req.headers.get("content-type") ?? "";
    const form: FormData | Record<string, unknown> = type.includes("application/json")
      ? ((await req.json().catch(() => ({}))) as Record<string, unknown>)
      : await req.formData().catch(() => new FormData());

    const grant = field(form, "grant_type");
    let tokens;
    if (grant === "authorization_code") {
      tokens = await exchangeAuthorizationCode({
        code: field(form, "code"),
        clientId: field(form, "client_id"),
        redirectUri: field(form, "redirect_uri"),
        codeVerifier: field(form, "code_verifier"),
      });
    } else if (grant === "refresh_token") {
      tokens = await refreshTokens({
        refreshToken: field(form, "refresh_token"),
        clientId: field(form, "client_id"),
      });
    } else {
      throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
    }
    return Response.json(tokens, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof OAuthError) {
      return Response.json(
        { error: err.error, error_description: err.message },
        { status: err.status, headers: NO_STORE }
      );
    }
    throw err;
  }
}
