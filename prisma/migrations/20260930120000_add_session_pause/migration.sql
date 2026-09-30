-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "pausedAt" TIMESTAMP(3);
ALTER TABLE "WorkoutSession" ADD COLUMN     "totalPausedSeconds" INTEGER NOT NULL DEFAULT 0;
