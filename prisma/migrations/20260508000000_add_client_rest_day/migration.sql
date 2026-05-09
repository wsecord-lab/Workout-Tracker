-- CreateTable
CREATE TABLE "ClientRestDay" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRestDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientRestDay_clientId_date_idx" ON "ClientRestDay"("clientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ClientRestDay_clientId_date_key" ON "ClientRestDay"("clientId", "date");

-- AddForeignKey
ALTER TABLE "ClientRestDay" ADD CONSTRAINT "ClientRestDay_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
