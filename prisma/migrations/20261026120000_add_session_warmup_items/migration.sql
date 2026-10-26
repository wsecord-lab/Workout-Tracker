-- CreateTable
CREATE TABLE "SessionWarmupItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3),
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionWarmupItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionWarmupItem_sessionId_orderIndex_idx" ON "SessionWarmupItem"("sessionId", "orderIndex");

-- AddForeignKey
ALTER TABLE "SessionWarmupItem" ADD CONSTRAINT "SessionWarmupItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
