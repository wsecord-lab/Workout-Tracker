-- CreateTable
CREATE TABLE "WarmupBlock" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WarmupBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarmupBlockItem" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "details" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WarmupBlockItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN IF NOT EXISTS "warmupBlockId" TEXT;

-- CreateIndex
CREATE INDEX "WarmupBlock_trainerId_idx" ON "WarmupBlock"("trainerId");

-- CreateIndex
CREATE INDEX "WarmupBlockItem_blockId_idx" ON "WarmupBlockItem"("blockId");

-- CreateIndex
CREATE INDEX "WorkoutSession_warmupBlockId_idx" ON "WorkoutSession"("warmupBlockId");

-- AddForeignKey
ALTER TABLE "WarmupBlock" ADD CONSTRAINT "WarmupBlock_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarmupBlockItem" ADD CONSTRAINT "WarmupBlockItem_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "WarmupBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_warmupBlockId_fkey" FOREIGN KEY ("warmupBlockId") REFERENCES "WarmupBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
