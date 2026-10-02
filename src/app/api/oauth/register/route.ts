import { OAuthError, registerClient } from "../../../../../mcp/src/oauth";
import { checkRegistrationAllowed, clientIp, recordRegistration } from "@/lib/login-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dynamic client registration (RFC 7591): an AI app introduces itself before sign-in.
export async function POST(req: Request) {
  // Registration needs no sign-in, so cap it per IP to keep junk out of the database.
  const ip = clientIp(req.headers);
  const limit = await checkRegistrationAllowed(ip);
  if (!limit.allowed) {
    return Response.json(
      { error: "invalid_client_metadata", error_description: "Too many registrations. Try again later." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterMinutes * 60) } }
    );
  }
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new OAuthError("invalid_request", "Send a JSON body.");
    }
    const client = await registerClient({
      clientName: body.client_name,
      redirectUris: body.redirect_uris,
    });
    await recordRegistration(ip);
    return Response.json(
      {
        client_id: client.clientId,
        client_name: client.clientName ?? undefined,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      { status: 201, headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof OAuthError) {
      return Response.json(
        { error: err.error === "invalid_request" ? "invalid_client_metadata" : err.error, error_description: err.message },
        { status: err.status }
      );
    }
    throw err;
  }
}
