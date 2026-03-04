/**
 * Backup script. For PostgreSQL, use your provider's backup (Neon, etc.).
 * This script only supported SQLite file copy; with Postgres, backups are managed by the DB provider.
 */
import fs from "node:fs";
import path from "node:path";

// Load .env from project root (standalone script)
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

const url = process.env.DATABASE_URL ?? "";
if (url.startsWith("postgres")) {
  console.log(
    "PostgreSQL in use. Backups: use your provider's tools (e.g. Neon dashboard, pg_dump)."
  );
  process.exit(0);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl?.startsWith("file:")) {
  console.error("DATABASE_URL must use file: protocol for SQLite backup.");
  process.exit(1);
}

const filePath = dbUrl.replace(/^file:/, "").trim();
const dbPath = path.isAbsolute(filePath)
  ? filePath
  : path.resolve(process.cwd(), "prisma", filePath);
const backupsDir = path.join(process.cwd(), "backups");

if (!fs.existsSync(dbPath)) {
  throw new Error(`Database file not found: ${dbPath}`);
}

fs.mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = path.join(backupsDir, `dev-${stamp}.db`);

fs.copyFileSync(dbPath, dest);
console.log(`Backed up ${dbPath} -> ${dest}`);
