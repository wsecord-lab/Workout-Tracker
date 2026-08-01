-- ────────────────────────────────────────────────────────────────
-- Set: planned vs completed
-- ────────────────────────────────────────────────────────────────
ALTER TABLE "Set" ADD COLUMN     "plannedWeightKg" DOUBLE PRECISION;
ALTER TABLE "Set" ADD COLUMN     "plannedReps"     INTEGER;
ALTER TABLE "Set" ADD COLUMN     "completedAt"     TIMESTAMP(3);

-- Every set that exists today was actually performed. createdAt is the closest
-- true completion time we have, and it keeps completedAt monotonic with the
-- existing createdAt tie-break in previous-session-best.
UPDATE "Set" SET "completedAt" = "createdAt" WHERE "completedAt" IS NULL;

-- plannedWeightKg / plannedReps stay NULL for historical rows: there was never a
-- plan, so "planned X -> did Y" correctly renders nothing for old sets.

CREATE INDEX "Set_exerciseId_completedAt_idx" ON "Set"("exerciseId", "completedAt");

-- ────────────────────────────────────────────────────────────────
-- WorkoutSession: duration + normalized name
-- ────────────────────────────────────────────────────────────────
ALTER TABLE "WorkoutSession" ADD COLUMN     "startedAt"       TIMESTAMP(3);
ALTER TABLE "WorkoutSession" ADD COLUMN     "durationSeconds" INTEGER;
ALTER TABLE "WorkoutSession" ADD COLUMN     "normalizedName"  TEXT;

-- Mirrors src/lib/normalize-exercise-name.ts: trim, collapse whitespace runs, lowercase.
UPDATE "WorkoutSession"
SET "normalizedName" = NULLIF(lower(btrim(regexp_replace("name", '\s+', ' ', 'g'))), '')
WHERE "name" IS NOT NULL;

CREATE INDEX "WorkoutSession_clientId_normalizedName_date_idx"
  ON "WorkoutSession"("clientId", "normalizedName", "date");

-- ────────────────────────────────────────────────────────────────
-- orderIndex backfill: Exercise
-- createExercise never assigned orderIndex, so manually-added exercises all sit
-- at 0 and their display order is whatever Postgres returns. Existing non-zero
-- values win; ties break by id. Exercise has no createdAt, but cuid ids are
-- timestamp-prefixed and therefore k-sortable, so id ASC approximates insertion
-- order. Soft-deleted rows are numbered too, so restoreExercise cannot collide.
-- ────────────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "sessionId"
           ORDER BY "orderIndex" ASC, "id" ASC
         ) - 1 AS rn
  FROM "Exercise"
)
UPDATE "Exercise" e
SET "orderIndex" = ranked.rn
FROM ranked
WHERE e."id" = ranked."id" AND e."orderIndex" IS DISTINCT FROM ranked.rn;

-- ────────────────────────────────────────────────────────────────
-- orderIndex backfill: Set
-- createSetsBulk never assigned orderIndex, so bulk-added sets all collide at 0.
-- Set has createdAt, so ordering is exact. Any order already established via the
-- old swapSetOrder survives, because orderIndex is the leading sort key.
-- ────────────────────────────────────────────────────────────────
WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "exerciseId"
           ORDER BY "orderIndex" ASC, "createdAt" ASC, "id" ASC
         ) - 1 AS rn
  FROM "Set"
)
UPDATE "Set" s
SET "orderIndex" = ranked.rn
FROM ranked
WHERE s."id" = ranked."id" AND s."orderIndex" IS DISTINCT FROM ranked.rn;
