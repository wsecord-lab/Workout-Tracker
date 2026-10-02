import { resolve } from "path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const prisma = new PrismaClient();

/** Demo accounts below have public passwords. Only ever seed a database on this computer. */
function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {}
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    console.error(
      `Refusing to seed: DATABASE_URL points at "${host || "an unknown host"}", not a local database. ` +
        "The seed creates demo accounts with public passwords."
    );
    process.exit(1);
  }
}

const EXAMPLE_CLIENT_EMAIL = "client@example.com";
const EXAMPLE_CLIENT_PASSWORD = "client123";
const EXAMPLE_TRAINER_EMAIL = "demo-trainer@example.com";
const EXAMPLE_TRAINER_PASSWORD = "trainer123";

/** Simple test credentials (same password for both). Use for quick testing. */
const TEST_TRAINER_EMAIL = "trainer@test.com";
const TEST_CLIENT_EMAIL = "client@test.com";
const TEST_PASSWORD = "test123";

const OLD_EXAMPLE_TRAINER_EMAIL = "trainer@example.com";

async function main() {
  assertLocalDatabase();

  // Remove old example trainer if present (replaced by new trainer profile)
  await prisma.user.deleteMany({ where: { email: OLD_EXAMPLE_TRAINER_EMAIL } });

  // —— Trainer login account (role TRAINER) ——
  const trainerPasswordHash = await hash(EXAMPLE_TRAINER_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: EXAMPLE_TRAINER_EMAIL },
    create: {
      email: EXAMPLE_TRAINER_EMAIL,
      passwordHash: trainerPasswordHash,
      name: "Demo Trainer",
      role: "TRAINER",
    },
    update: {},
  });
  const trainer = await prisma.user.findUnique({
    where: { email: EXAMPLE_TRAINER_EMAIL },
    select: { id: true },
  });
  const trainerId = trainer!.id;

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
    update: {},
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
        trainerId,
        weightRecords: {
          create: [
            { weightKg: 79 },
            { weightKg: 78.5 },
            { weightKg: 78 },
            { weightKg: 77.5 },
            { weightKg: 77.8 },
            { weightKg: 77.2 },
            { weightKg: 77 },
            { weightKg: 76.8 },
          ],
        },
      },
    });
  } else {
    const wrCount = await prisma.clientWeightRecord.count({ where: { clientId: demoClient.id } });
    if (wrCount < 8) {
      const baseDate = Date.now() - 60 * 24 * 60 * 60 * 1000;
      const weights = [79, 78.5, 78, 77.5, 77.8, 77.2, 77, 76.8];
      for (let i = 0; i < weights.length; i++) {
        await prisma.clientWeightRecord.create({
          data: {
            clientId: demoClient.id,
            weightKg: weights[i],
            recordedAt: new Date(baseDate + i * 7 * 24 * 60 * 60 * 1000),
          },
        });
      }
    }
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
      data: { name: "Bench Press", sessionId: s1.id, orderIndex: 0 },
    });
    const squat = await prisma.exercise.create({
      data: { name: "Squat", sessionId: s2.id, orderIndex: 0 },
    });
    // completedAt is required for seeded sets to appear in charts, metrics, and
    // exports — those read paths only count sets that were actually performed.
    await prisma.set.createMany({
      data: [
        { weightKg: 60, reps: 10, exerciseId: bench.id, rpe: 7, orderIndex: 0, completedAt: s1.date },
        { weightKg: 65, reps: 8, exerciseId: bench.id, rpe: 8, notes: "Felt strong", orderIndex: 1, completedAt: s1.date },
        { weightKg: 80, reps: 5, exerciseId: squat.id, orderIndex: 0, completedAt: s2.date },
        { weightKg: 85, reps: 5, exerciseId: squat.id, rpe: 8.5, orderIndex: 1, completedAt: s2.date },
      ],
    });
  }

  // —— Bulk sample sessions for demo client (past ~10 weeks) ——
  const demoSessionCount = await prisma.workoutSession.count({
    where: { clientId: demoClient.id },
  });
  const TARGET_DEMO_SESSIONS = 24;
  if (demoSessionCount < TARGET_DEMO_SESSIONS) {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const sessionTemplates: { name: string; exercises: { name: string; sets: { weightKg: number; reps: number; rpe?: number; notes?: string }[] }[] }[] = [
      {
        name: "Push day",
        exercises: [
          { name: "Bench Press", sets: [{ weightKg: 60, reps: 10, rpe: 7 }, { weightKg: 65, reps: 8, rpe: 8 }, { weightKg: 67.5, reps: 6, rpe: 8.5 }] },
          { name: "Overhead Press", sets: [{ weightKg: 35, reps: 10, rpe: 7 }, { weightKg: 40, reps: 8, rpe: 8 }] },
          { name: "Incline Dumbbell Press", sets: [{ weightKg: 22, reps: 10 }, { weightKg: 24, reps: 8, rpe: 8 }] },
        ],
      },
      {
        name: "Pull day",
        exercises: [
          { name: "Barbell Row", sets: [{ weightKg: 60, reps: 10, rpe: 7 }, { weightKg: 70, reps: 8, rpe: 8 }, { weightKg: 75, reps: 6, rpe: 8.5 }] },
          { name: "Lat Pulldown", sets: [{ weightKg: 45, reps: 12 }, { weightKg: 50, reps: 10, rpe: 8 }] },
          { name: "Face Pull", sets: [{ weightKg: 25, reps: 15 }, { weightKg: 27.5, reps: 12, rpe: 7 }] },
        ],
      },
      {
        name: "Legs",
        exercises: [
          { name: "Squat", sets: [{ weightKg: 80, reps: 8, rpe: 7 }, { weightKg: 90, reps: 6, rpe: 8 }, { weightKg: 95, reps: 5, rpe: 8.5, notes: "PR attempt" }] },
          { name: "Romanian Deadlift", sets: [{ weightKg: 70, reps: 10 }, { weightKg: 80, reps: 8, rpe: 8 }] },
          { name: "Leg Press", sets: [{ weightKg: 120, reps: 12 }, { weightKg: 140, reps: 10, rpe: 8 }] },
        ],
      },
      {
        name: "Upper body",
        exercises: [
          { name: "Bench Press", sets: [{ weightKg: 62.5, reps: 9, rpe: 7.5 }, { weightKg: 65, reps: 8, rpe: 8 }] },
          { name: "Squat", sets: [{ weightKg: 82.5, reps: 6, rpe: 8 }, { weightKg: 85, reps: 5, rpe: 8.5 }] },
        ],
      },
      {
        name: "Full body",
        exercises: [
          { name: "Deadlift", sets: [{ weightKg: 100, reps: 5, rpe: 7 }, { weightKg: 110, reps: 4, rpe: 8 }, { weightKg: 115, reps: 3, rpe: 8.5 }] },
          { name: "Bench Press", sets: [{ weightKg: 60, reps: 8, rpe: 8 }] },
          { name: "Squat", sets: [{ weightKg: 85, reps: 5, rpe: 8 }] },
        ],
      },
      {
        name: "Lower body",
        exercises: [
          { name: "Squat", sets: [{ weightKg: 85, reps: 6, rpe: 7.5 }, { weightKg: 90, reps: 5, rpe: 8 }, { weightKg: 92.5, reps: 4, rpe: 8.5 }] },
          { name: "Leg Curl", sets: [{ weightKg: 35, reps: 12 }, { weightKg: 40, reps: 10, rpe: 8 }] },
          { name: "Calf Raise", sets: [{ weightKg: 50, reps: 15 }, { weightKg: 55, reps: 12 }] },
        ],
      },
    ];
    let added = 0;
    for (let w = 0; w < 10 && added + demoSessionCount < TARGET_DEMO_SESSIONS; w++) {
      for (let d = 0; d < 3 && added + demoSessionCount < TARGET_DEMO_SESSIONS; d++) {
        const template = sessionTemplates[(added + d) % sessionTemplates.length];
        const daysAgo = 7 * w + d * 2 + 1;
        const sessionDate = new Date(now - daysAgo * day);
        const session = await prisma.workoutSession.create({
          data: {
            clientId: demoClient.id,
            name: template.name,
            date: sessionDate,
          },
        });
        for (const [exIndex, ex] of template.exercises.entries()) {
          const exercise = await prisma.exercise.create({
            data: { name: ex.name, sessionId: session.id, orderIndex: exIndex },
          });
          await prisma.set.createMany({
            data: ex.sets.map((s, setIndex) => ({
              exerciseId: exercise.id,
              weightKg: s.weightKg,
              reps: s.reps,
              rpe: s.rpe ?? null,
              notes: s.notes ?? null,
              orderIndex: setIndex,
              completedAt: sessionDate,
            })),
          });
        }
        added++;
      }
    }
    console.log(`Added ${added} sample sessions for Alex Demo.`);
  }

  // —— Test accounts (simple credentials, same password for both) ——
  const testPasswordHash = await hash(TEST_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: TEST_TRAINER_EMAIL },
    create: {
      email: TEST_TRAINER_EMAIL,
      passwordHash: testPasswordHash,
      name: "Test Trainer",
      role: "TRAINER",
    },
    update: {},
  });
  const testClientUser = await prisma.user.upsert({
    where: { email: TEST_CLIENT_EMAIL },
    create: {
      email: TEST_CLIENT_EMAIL,
      passwordHash: testPasswordHash,
      name: "Test Client",
      role: "CLIENT",
    },
    update: {},
  });
  const testClientProfile = await prisma.client.findFirst({
    where: { userId: testClientUser.id },
  });
  if (!testClientProfile) {
    await prisma.client.create({
      data: {
        name: "Test Client",
        age: 30,
        heightCm: 170,
        bodyWeightKg: 70,
        userId: testClientUser.id,
        weightRecords: { create: { weightKg: 70 } },
      },
    });
  }

  console.log("\nExample trainer login:");
  console.log("  Email:", EXAMPLE_TRAINER_EMAIL);
  console.log("  Password:", EXAMPLE_TRAINER_PASSWORD);
  console.log("\nExample client login:");
  console.log("  Email:", EXAMPLE_CLIENT_EMAIL);
  console.log("  Password:", EXAMPLE_CLIENT_PASSWORD);
  console.log("\n--- Test accounts (same password for both) ---");
  console.log("Trainer view:  Email:", TEST_TRAINER_EMAIL, " Password:", TEST_PASSWORD);
  console.log("Client view:   Email:", TEST_CLIENT_EMAIL, " Password:", TEST_PASSWORD);
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
        trainerId,
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
        trainerId,
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

  // —— Extra sample sessions for Alice and Bob (trainer view) ——
  const aliceCount = await prisma.workoutSession.count({ where: { clientId: client1.id } });
  const bobCount = await prisma.workoutSession.count({ where: { clientId: client2.id } });
  const day = 24 * 60 * 60 * 1000;

  if (aliceCount < 8) {
    const aliceSessions = [
      { name: "Push", exercises: ["Bench Press", "OHP", "Tricep Pushdown"] },
      { name: "Pull", exercises: ["Row", "Pulldown", "Curl"] },
      { name: "Legs", exercises: ["Squat", "RDL", "Lunge"] },
      { name: "Upper", exercises: ["Bench", "Row", "OHP"] },
      { name: "Lower", exercises: ["Squat", "Leg Press", "Calf"] },
    ];
    for (let i = aliceCount; i < 8; i++) {
      const t = aliceSessions[i % aliceSessions.length];
      const session = await prisma.workoutSession.create({
        data: {
          clientId: client1.id,
          name: t.name,
          date: new Date(Date.now() - (i + 1) * 4 * day),
        },
      });
      for (const exName of t.exercises) {
        const ex = await prisma.exercise.create({ data: { name: exName, sessionId: session.id } });
        await prisma.set.createMany({
          data: [
            { weightKg: 50 + i * 2, reps: 10, exerciseId: ex.id },
            { weightKg: 55 + i * 2, reps: 8, exerciseId: ex.id, rpe: 8 },
          ],
        });
      }
    }
    console.log("Added extra sessions for Alice Smith.");
  }

  if (bobCount < 8) {
    const bobSessions = [
      { name: "Strength", exercises: ["Deadlift", "Squat", "Bench"] },
      { name: "Hypertrophy", exercises: ["Row", "OHP", "Leg Press"] },
      { name: "Full body", exercises: ["Deadlift", "Bench", "Squat"] },
    ];
    for (let i = bobCount; i < 8; i++) {
      const t = bobSessions[i % bobSessions.length];
      const session = await prisma.workoutSession.create({
        data: {
          clientId: client2.id,
          name: t.name,
          date: new Date(Date.now() - (i + 1) * 4 * day),
        },
      });
      for (const exName of t.exercises) {
        const ex = await prisma.exercise.create({ data: { name: exName, sessionId: session.id } });
        await prisma.set.createMany({
          data: [
            { weightKg: 80 + i * 3, reps: 6, exerciseId: ex.id, rpe: 8 },
            { weightKg: 85 + i * 3, reps: 5, exerciseId: ex.id, rpe: 8.5 },
          ],
        });
      }
    }
    console.log("Added extra sessions for Bob Jones.");
  }

  // Assign any clients without a trainer to the main trainer (migration from pre-tenant schema)
  const updated = await prisma.client.updateMany({
    where: { trainerId: null },
    data: { trainerId },
  });
  if (updated.count > 0) {
    console.log(`Assigned ${updated.count} client(s) to default trainer.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
