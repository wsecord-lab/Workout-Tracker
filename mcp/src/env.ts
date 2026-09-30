import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

/** Load `.env` from the process working directory (project root when launched via MCP config). */
export function loadProjectEnv(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    // quiet: MCP uses stdout for JSON-RPC — never log there.
    dotenv.config({ path: envPath, quiet: true });
  }
}
