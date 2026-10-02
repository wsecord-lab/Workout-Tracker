import { authorizationServerMetadata, publicOrigin } from "../../../../../mcp/src/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json(authorizationServerMetadata(publicOrigin(req)), {
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
  });
}
