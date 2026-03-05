/**
 * One-time repair for failed migration 20260308000000_add_exercise_group_id (P3009).
 * Checks if groupId column exists on Exercise table, then runs the appropriate
 * prisma migrate resolve so deploy can succeed.
 *
 * Usage: DATABASE_URL="postgresql://..." npx tsx scripts/fixMigration.ts
 * Or ensure .env has DATABASE_URL and run: npx tsx scripts/fixMigration.ts
 */

import { execSync } from "child_process";
import path from "path";
import { PrismaClient } from "@prisma/client";

const MIGRATION_NAME = "20260308000000_add_exercise_group_id";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Set it in .env or pass it when running this script.");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    // Prisma maps model Exercise to table "Exercise" in PostgreSQL (default).
    // information_schema.table_name can be lowercase in some setups.
    const result = await prisma.$queryRaw<
      { column_name: string }[]
    >`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND LOWER(table_name) = 'exercise'
        AND column_name = 'groupId'
    `;

    const columnExists = Array.isArray(result) && result.length > 0;

    if (columnExists) {
      console.log("Column Exercise.groupId exists. Marking migration as applied.");
      execSync(`npx prisma migrate resolve --applied ${MIGRATION_NAME}`, {
        stdio: "inherit",
        cwd: path.join(__dirname, ".."),
        env: process.env,
      });
    } else {
      console.log("Column Exercise.groupId does not exist. Marking migration as rolled back.");
      execSync(`npx prisma migrate resolve --rolled-back ${MIGRATION_NAME}`, {
        stdio: "inherit",
        cwd: path.join(__dirname, ".."),
        env: process.env,
      });
    }

    console.log("Running prisma migrate deploy...");
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
      env: process.env,
    });
    console.log("Done. You can redeploy on Vercel.");
  } catch (err) {
    console.error("Fix failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
