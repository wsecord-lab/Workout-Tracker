-- Trainer-scope WorkoutTemplate + planned-set fields on items.
-- Safe for existing rows: backfill trainerId from oldest TRAINER, drop orphans, then NOT NULL.

-- AlterTable: WorkoutTemplate — add trainerId (nullable first)
ALTER TABLE "WorkoutTemplate" ADD COLUMN "trainerId" TEXT;

-- Backfill: assign existing templates to the earliest trainer account
UPDATE "WorkoutTemplate"
SET "trainerId" = (
  SELECT "id" FROM "User" WHERE "role" = 'TRAINER' ORDER BY "createdAt" ASC LIMIT 1
)
WHERE "trainerId" IS NULL;

-- Orphans (no trainer in DB): remove rather than leave unscoped globals
DELETE FROM "WorkoutTemplateItem"
WHERE "templateId" IN (SELECT "id" FROM "WorkoutTemplate" WHERE "trainerId" IS NULL);

DELETE FROM "WorkoutTemplate" WHERE "trainerId" IS NULL;

-- Enforce NOT NULL now that all remaining rows are scoped
ALTER TABLE "WorkoutTemplate" ALTER COLUMN "trainerId" SET NOT NULL;

-- AlterTable: WorkoutTemplateItem — optional planned-set prescription (PlanSetsForm shape)
ALTER TABLE "WorkoutTemplateItem" ADD COLUMN "plannedSetCount" INTEGER;
ALTER TABLE "WorkoutTemplateItem" ADD COLUMN "plannedWeightKg" DOUBLE PRECISION;
ALTER TABLE "WorkoutTemplateItem" ADD COLUMN "plannedReps" INTEGER;

-- Drop old global archive-only index; replace with trainer-scoped indexes
DROP INDEX IF EXISTS "WorkoutTemplate_isArchived_idx";
CREATE INDEX "WorkoutTemplate_trainerId_idx" ON "WorkoutTemplate"("trainerId");
CREATE INDEX "WorkoutTemplate_trainerId_isArchived_idx" ON "WorkoutTemplate"("trainerId", "isArchived");

-- FK
ALTER TABLE "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_trainerId_fkey"
  FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
