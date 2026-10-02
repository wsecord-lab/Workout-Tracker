import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateKey, bearerToken } from "../../../../mcp/src/apikeys";
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
  const actor = await authenticateKey(bearerToken(req.headers.get("authorization")));
  if (!actor) {
    return json(
      401,
      { jsonrpc: "2.0", error: { code: -32001, message: "Missing or invalid API key." }, id: null },
      { "www-authenticate": 'Bearer realm="workout-tracker"' }
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
