-- CreateTable
CREATE TABLE "TrainerExerciseCatalogItem" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerExerciseCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainerExerciseCatalogItem_trainerId_normalizedName_key" ON "TrainerExerciseCatalogItem"("trainerId", "normalizedName");
CREATE INDEX "TrainerExerciseCatalogItem_trainerId_idx" ON "TrainerExerciseCatalogItem"("trainerId");

-- AddForeignKey
ALTER TABLE "TrainerExerciseCatalogItem" ADD CONSTRAINT "TrainerExerciseCatalogItem_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
