import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadProjectEnv } from "./env";
import { resolveActorFromEnv } from "./trainer";
import { createServer } from "./server";

loadProjectEnv();

async function main() {
  const server = createServer(resolveActorFromEnv);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LifeSport workout MCP server running on stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
