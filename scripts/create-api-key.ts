/**
 * Create (or revoke) an MCP API key for an account.
 *
 *   npx tsx scripts/create-api-key.ts create <email> "<label>"
 *   npx tsx scripts/create-api-key.ts list
 *   npx tsx scripts/create-api-key.ts revoke <keyId>
 *
 * The key is printed ONCE. Only its hash is stored, so a lost key must be replaced.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { generateApiKey, hashApiKey } from "../mcp/src/apikeys";

const prisma = new PrismaClient();

async function main() {
  const [cmd, a, b] = process.argv.slice(2);

  if (cmd === "create") {
    if (!a) return usage();
    const user = await prisma.user.findUnique({ where: { email: a.trim().toLowerCase() } });
    if (!user) {
      console.error(`No user with email ${a}.`);
      process.exit(1);
    }
    const key = generateApiKey();
    const row = await prisma.apiKey.create({
      data: {
        userId: user.id,
        label: b?.trim() || "MCP key",
        keyHash: hashApiKey(key),
        prefix: key.slice(0, 7),
      },
    });
    console.log(`Key for ${user.email} (${user.role}), id ${row.id}:\n\n  ${key}\n`);
    console.log("Copy it now. It cannot be shown again.");
    return;
  }

  if (cmd === "list") {
    const rows = await prisma.apiKey.findMany({
      orderBy: { createdAt: "asc" },
      include: { user: { select: { email: true, role: true } } },
    });
    for (const r of rows) {
      console.log(
        `${r.id}  ${r.prefix}…  ${r.user.email} (${r.user.role})  "${r.label}"  ${
          r.revokedAt ? "REVOKED" : "active"
        }  last used: ${r.lastUsedAt?.toISOString() ?? "never"}`
      );
    }
    return;
  }

  if (cmd === "revoke") {
    if (!a) return usage();
    await prisma.apiKey.update({ where: { id: a }, data: { revokedAt: new Date() } });
    console.log("Revoked.");
    return;
  }

  usage();
}

function usage() {
  console.error('Usage: create <email> "<label>" | list | revoke <keyId>');
  process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
