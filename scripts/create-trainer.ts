/**
 * Create a trainer user (role TRAINER).
 * Usage: npx tsx scripts/create-trainer.ts <email> <password>
 * Or: npm run create:trainer -- <email> <password>
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error("Usage: npx tsx scripts/create-trainer.ts <email> <password>");
    process.exit(1);
  }

  const emailNormalized = email.trim().toLowerCase();
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { email: emailNormalized } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, role: Role.TRAINER },
    });
    console.log(`Trainer password updated for: ${emailNormalized}`);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: emailNormalized,
      passwordHash,
      role: Role.TRAINER,
    },
  });

  console.log(`Trainer user created: ${user.email} (id: ${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
