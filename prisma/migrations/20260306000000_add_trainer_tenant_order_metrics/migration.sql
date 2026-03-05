-- AlterTable: Client - add trainerId for multi-trainer tenant isolation
ALTER TABLE "Client" ADD COLUMN "trainerId" TEXT;

-- CreateTable: ClientMetricsCache for server-side metrics caching
CREATE TABLE "ClientMetricsCache" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "rangeKey" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" TEXT NOT NULL,

    CONSTRAINT "ClientMetricsCache_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Exercise - add orderIndex for stable ordering
ALTER TABLE "Exercise" ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Set - add orderIndex and createdAt
ALTER TABLE "Set" ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Set" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Client_trainerId_idx" ON "Client"("trainerId");
CREATE UNIQUE INDEX "ClientMetricsCache_clientId_rangeKey_key" ON "ClientMetricsCache"("clientId", "rangeKey");
CREATE INDEX "ClientMetricsCache_clientId_idx" ON "ClientMetricsCache"("clientId");
CREATE INDEX "Set_exerciseId_orderIndex_idx" ON "Set"("exerciseId", "orderIndex");

-- AddForeignKey: Client.trainerId -> User
ALTER TABLE "Client" ADD CONSTRAINT "Client_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: ClientMetricsCache.clientId -> Client
ALTER TABLE "ClientMetricsCache" ADD CONSTRAINT "ClientMetricsCache_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
