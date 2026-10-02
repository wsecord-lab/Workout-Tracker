import { protectedResourceMetadata, publicOrigin } from "../../../../../mcp/src/oauth";

export const dynamic = "force-dynamic";

// Tells AI apps which server handles sign-in for /api/mcp. Served at the root and at the
// path-suffixed address (/.well-known/oauth-protected-resource/api/mcp).
export async function GET(req: Request) {
  return Response.json(protectedResourceMetadata(publicOrigin(req)), {
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
  });
}
