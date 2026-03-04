-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TRAINER', 'CLIENT');

-- User: rename password to passwordHash
ALTER TABLE "User" RENAME COLUMN "password" TO "passwordHash";

-- User: convert role from TEXT to Role (preserve existing data)
ALTER TABLE "User" ADD COLUMN "role_new" "Role";
UPDATE "User" SET "role_new" = 'TRAINER' WHERE "role" IN ('trainer', 'admin');
UPDATE "User" SET "role_new" = 'CLIENT' WHERE "role" = 'client' OR "role_new" IS NULL;
ALTER TABLE "User" ALTER COLUMN "role_new" SET NOT NULL;
ALTER TABLE "User" DROP COLUMN "role";
ALTER TABLE "User" RENAME COLUMN "role_new" TO "role";

-- Account: add id as primary key, keep unique(provider, providerAccountId)
ALTER TABLE "Account" ADD COLUMN "id" TEXT;
UPDATE "Account" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "Account" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "Account" DROP CONSTRAINT "Account_pkey";
ALTER TABLE "Account" ADD CONSTRAINT "Account_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- Session: add id as primary key
ALTER TABLE "Session" ADD COLUMN "id" TEXT;
UPDATE "Session" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "Session" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "Session" ADD CONSTRAINT "Session_pkey" PRIMARY KEY ("id");

-- Client: drop unique on userId, add index (one user can have multiple Client records per spec)
DROP INDEX IF EXISTS "Client_userId_key";
CREATE INDEX "Client_userId_idx" ON "Client"("userId");
