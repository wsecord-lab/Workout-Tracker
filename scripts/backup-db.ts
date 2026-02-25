/**
 * Backup SQLite database to backups/ with timestamped filename.
 * Uses SQLITE_DB_PATH if set, otherwise parses DATABASE_URL for file path.
 * Load .env from project root so env vars are available when run standalone.
 */
import fs from "node:fs";
import path from "node:path";

// Load .env from project root (standalone script, no Next.js)
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function getDbPath(): string {
  if (process.env.SQLITE_DB_PATH) {
    return path.resolve(process.cwd(), process.env.SQLITE_DB_PATH);
  }
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL must be set and use file: protocol (e.g. file:./dev.db). " +
        "Or set SQLITE_DB_PATH to the db file path."
    );
  }
  const filePath = url.replace(/^file:/, "").trim();
  // Prisma resolves relative paths from schema dir (prisma/), so ./dev.db -> prisma/dev.db
  if (path.isAbsolute(filePath)) return filePath;
  const prismaDir = path.join(process.cwd(), "prisma");
  return path.resolve(prismaDir, filePath);
}

const dbPath = getDbPath();
const backupsDir = path.join(process.cwd(), "backups");

if (!fs.existsSync(dbPath)) {
  throw new Error(`Database file not found: ${dbPath}`);
}

fs.mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = path.join(backupsDir, `dev-${stamp}.db`);

fs.copyFileSync(dbPath, dest);
console.log(`Backed up ${dbPath} -> ${dest}`);
