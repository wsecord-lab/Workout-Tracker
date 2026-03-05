import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const EXAMPLE_CLIENT_EMAIL = "client@example.com";
const EXAMPLE_CLIENT_PASSWORD = "client123";
const EXAMPLE_TRAINER_EMAIL = "trainer@example.com";
const EXAMPLE_TRAINER_PASSWORD = "trainer123";

async function main() {
  // —— Example trainer login account (role TRAINER) ——
  const trainerPasswordHash = await hash(EXAMPLE_TRAINER_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: EXAMPLE_TRAINER_EMAIL },
    create: {
      email: EXAMPLE_TRAINER_EMAIL,
      passwordHash: trainerPasswordHash,
      name: "Demo Trainer",
      role: "TRAINER",
    },
    update: { passwordHash: trainerPasswordHash },
  });

  // —— Example client login account (role CLIENT) ——
  const clientPasswordHash = await hash(EXAMPLE_CLIENT_PASSWORD, 10);
  const exampleUser = await prisma.user.upsert({
    where: { email: EXAMPLE_CLIENT_EMAIL },
    create: {
      email: EXAMPLE_CLIENT_EMAIL,
      passwordHash: clientPasswordHash,
      name: "Demo Client",
      role: "CLIENT",
    },
    update: { passwordHash: clientPasswordHash },
  });

  let demoClient = await prisma.client.findFirst({
    where: { userId: exampleUser.id },
  });
  if (!demoClient) {
    demoClient = await prisma.client.create({
      data: {
        name: "Alex Demo",
        age: 32,
        heightCm: 175,
        bodyWeightKg: 78,
        userId: exampleUser.id,
        weightRecords: { create: [{ weightKg: 78 }, { weightKg: 77.5 }] },
      },
    });
  }

  const existingSessions = await prisma.workoutSession.findMany({
    where: { clientId: demoClient.id },
    take: 5,
  });
  if (existingSessions.length === 0) {
    const s1 = await prisma.workoutSession.create({
      data: {
        clientId: demoClient.id,
        name: "Upper body",
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    });
    const s2 = await prisma.workoutSession.create({
      data: {
        clientId: demoClient.id,
        name: "Lower body",
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    });
    const bench = await prisma.exercise.create({
      data: { name: "Bench Press", sessionId: s1.id },
    });
    const squat = await prisma.exercise.create({
      data: { name: "Squat", sessionId: s2.id },
    });
    await prisma.set.createMany({
      data: [
        { weightKg: 60, reps: 10, exerciseId: bench.id, rpe: 7 },
        { weightKg: 65, reps: 8, exerciseId: bench.id, rpe: 8, notes: "Felt strong" },
        { weightKg: 80, reps: 5, exerciseId: squat.id },
        { weightKg: 85, reps: 5, exerciseId: squat.id, rpe: 8.5 },
      ],
    });
  }

  console.log("\nExample trainer login:");
  console.log("  Email:", EXAMPLE_TRAINER_EMAIL);
  console.log("  Password:", EXAMPLE_TRAINER_PASSWORD);
  console.log("\nExample client login:");
  console.log("  Email:", EXAMPLE_CLIENT_EMAIL);
  console.log("  Password:", EXAMPLE_CLIENT_PASSWORD);
  console.log("");

  // —— Original seed data (no auth users) — idempotent: only create if not present ——
  let client1 = await prisma.client.findFirst({
    where: { name: "Alice Smith", age: 28 },
  });
  if (!client1) {
    client1 = await prisma.client.create({
      data: {
        name: "Alice Smith",
        age: 28,
        heightCm: 165,
        bodyWeightKg: 62,
        weightRecords: { create: { weightKg: 62 } },
      },
    });
    const session1 = await prisma.workoutSession.create({
      data: { clientId: client1.id },
    });
    const ex1a = await prisma.exercise.create({
      data: { name: "Bench Press", sessionId: session1.id },
    });
    const ex1b = await prisma.exercise.create({
      data: { name: "Squat", sessionId: session1.id },
    });
    await prisma.set.createMany({
      data: [
        { weightKg: 60, reps: 8, exerciseId: ex1a.id },
        { weightKg: 65, reps: 6, exerciseId: ex1a.id },
        { weightKg: 80, reps: 5, exerciseId: ex1b.id },
        { weightKg: 85, reps: 4, exerciseId: ex1b.id },
      ],
    });
  }

  let client2 = await prisma.client.findFirst({
    where: { name: "Bob Jones", age: 35 },
  });
  if (!client2) {
    client2 = await prisma.client.create({
      data: {
        name: "Bob Jones",
        age: 35,
        heightCm: 180,
        bodyWeightKg: 82,
        weightRecords: { create: { weightKg: 82 } },
      },
    });
    const session2 = await prisma.workoutSession.create({
      data: { clientId: client2.id },
    });
    const ex2a = await prisma.exercise.create({
      data: { name: "Deadlift", sessionId: session2.id },
    });
    const ex2b = await prisma.exercise.create({
      data: { name: "Overhead Press", sessionId: session2.id },
    });
    await prisma.set.createMany({
      data: [
        { weightKg: 100, reps: 5, exerciseId: ex2a.id },
        { weightKg: 105, reps: 3, exerciseId: ex2a.id },
        { weightKg: 40, reps: 8, exerciseId: ex2b.id },
        { weightKg: 42.5, reps: 6, exerciseId: ex2b.id },
      ],
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
