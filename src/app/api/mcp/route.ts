import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateKey, bearerToken } from "../../../../mcp/src/apikeys";
import { publicOrigin } from "../../../../mcp/src/oauth";
import { createServer } from "../../../../mcp/src/server";

// Remote MCP endpoint. AI apps (Claude, ChatGPT, Grok, Cursor…) connect here with
// "Authorization: Bearer wt_…". Each key belongs to one account and only sees that account's data.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export async function POST(req: Request) {
  const token = bearerToken(req.headers.get("authorization"));
  const actor = await authenticateKey(token);
  if (!actor) {
    // The resource_metadata pointer is how Claude and other apps discover the sign-in flow.
    const metadata = `${publicOrigin(req)}/.well-known/oauth-protected-resource/api/mcp`;
    const challenge = token
      ? `Bearer resource_metadata="${metadata}", error="invalid_token"`
      : `Bearer resource_metadata="${metadata}"`;
    return json(
      401,
      { jsonrpc: "2.0", error: { code: -32001, message: "Missing or invalid credentials." }, id: null },
      { "www-authenticate": challenge }
    );
  }

  // Stateless: a fresh server + transport per request, bound to this key's account.
  const server = createServer(async () => actor);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

function notAllowed() {
  return json(
    405,
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST." }, id: null },
    { allow: "POST" }
  );
}

export const GET = notAllowed;
export const DELETE = notAllowed;
