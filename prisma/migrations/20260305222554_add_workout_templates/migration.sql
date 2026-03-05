-- CreateTable
CREATE TABLE "WorkoutTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,

    CONSTRAINT "WorkoutTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkoutTemplate_isArchived_idx" ON "WorkoutTemplate"("isArchived");

-- CreateIndex
CREATE INDEX "WorkoutTemplateItem_templateId_idx" ON "WorkoutTemplateItem"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutTemplateItem_templateId_orderIndex_key" ON "WorkoutTemplateItem"("templateId", "orderIndex");

-- AddForeignKey
ALTER TABLE "WorkoutTemplateItem" ADD CONSTRAINT "WorkoutTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkoutTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
