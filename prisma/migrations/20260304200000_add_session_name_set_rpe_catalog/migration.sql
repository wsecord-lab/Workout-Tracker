-- AlterTable: WorkoutSession.name (optional)
ALTER TABLE "WorkoutSession" ADD COLUMN "name" TEXT;

-- AlterTable: Set.rpe and Set.notes (optional)
ALTER TABLE "Set" ADD COLUMN "rpe" DOUBLE PRECISION;
ALTER TABLE "Set" ADD COLUMN "notes" TEXT;

-- CreateTable: ExerciseCatalog
CREATE TABLE "ExerciseCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: ExerciseCatalog.name unique
CREATE UNIQUE INDEX "ExerciseCatalog_name_key" ON "ExerciseCatalog"("name");

-- AlterTable: Exercise.catalogExerciseId (optional FK to ExerciseCatalog)
ALTER TABLE "Exercise" ADD COLUMN "catalogExerciseId" TEXT;

-- CreateIndex: Exercise.catalogExerciseId (for FK lookups)
CREATE INDEX "Exercise_catalogExerciseId_idx" ON "Exercise"("catalogExerciseId");

-- AddForeignKey: Exercise -> ExerciseCatalog
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_catalogExerciseId_fkey" FOREIGN KEY ("catalogExerciseId") REFERENCES "ExerciseCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
