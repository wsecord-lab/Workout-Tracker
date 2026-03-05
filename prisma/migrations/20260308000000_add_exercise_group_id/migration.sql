-- AlterTable (IF NOT EXISTS so deploy succeeds when column was already added e.g. via db push)
ALTER TABLE "Exercise" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
