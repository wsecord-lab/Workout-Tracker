import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const client1 = await prisma.client.create({
    data: {
      name: "Alice Smith",
      age: 28,
      heightCm: 165,
      bodyWeightKg: 62,
      weightRecords: { create: { weightKg: 62 } },
    },
  });

  const client2 = await prisma.client.create({
    data: {
      name: "Bob Jones",
      age: 35,
      heightCm: 180,
      bodyWeightKg: 82,
      weightRecords: { create: { weightKg: 82 } },
    },
  });

  const session1 = await prisma.workoutSession.create({
    data: { clientId: client1.id },
  });

  const session2 = await prisma.workoutSession.create({
    data: { clientId: client2.id },
  });

  const ex1a = await prisma.exercise.create({
    data: { name: "Bench Press", sessionId: session1.id },
  });
  const ex1b = await prisma.exercise.create({
    data: { name: "Squat", sessionId: session1.id },
  });

  const ex2a = await prisma.exercise.create({
    data: { name: "Deadlift", sessionId: session2.id },
  });
  const ex2b = await prisma.exercise.create({
    data: { name: "Overhead Press", sessionId: session2.id },
  });

  await prisma.set.createMany({
    data: [
      { weightKg: 60, reps: 8, exerciseId: ex1a.id },
      { weightKg: 65, reps: 6, exerciseId: ex1a.id },
      { weightKg: 80, reps: 5, exerciseId: ex1b.id },
      { weightKg: 85, reps: 4, exerciseId: ex1b.id },
      { weightKg: 100, reps: 5, exerciseId: ex2a.id },
      { weightKg: 105, reps: 3, exerciseId: ex2a.id },
      { weightKg: 40, reps: 8, exerciseId: ex2b.id },
      { weightKg: 42.5, reps: 6, exerciseId: ex2b.id },
    ],
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
