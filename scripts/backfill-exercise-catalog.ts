/**
 * One-time backfill: populate ExerciseCatalog from distinct Exercise.name
 * and set Exercise.catalogExerciseId by matching names.
 *
 * Run once after applying migration 20260304200000_add_session_name_set_rpe_catalog:
 *   npx tsx scripts/backfill-exercise-catalog.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const distinctNames = await prisma.exercise.findMany({
    select: { name: true },
    distinct: ["name"],
  });

  if (distinctNames.length === 0) {
    console.log("No exercises found; nothing to backfill.");
    return;
  }

  let created = 0;
  for (const { name } of distinctNames) {
    const catalog = await prisma.exerciseCatalog.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    const result = await prisma.exercise.updateMany({
      where: { name },
      data: { catalogExerciseId: catalog.id },
    });
    if (result.count > 0) created += result.count;
  }

  console.log(
    `Backfill complete: ${distinctNames.length} distinct exercise name(s), ${created} exercise(s) linked to catalog.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
