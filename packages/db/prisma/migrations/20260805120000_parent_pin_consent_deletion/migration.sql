-- File 10 — PIN gate, consent & account deletion.
--
-- `Parent.consentGivenAt` / `consentVersion` already exist (file 03) and are not
-- touched here. Cascade rules for the deletion path already exist too
-- (Parent.userId → user, ChildProfile.parentId → Parent, and every child-owned
-- table → ChildProfile), so no foreign key is rewritten.
--
-- Generated offline with `prisma migrate diff --from-schema-datamodel …`; it has
-- not yet been applied to any database.

-- AlterTable
ALTER TABLE "Parent" ADD COLUMN     "deleteToken" TEXT,
ADD COLUMN     "deleteTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "pinFailedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "pinVerifiedUntil" TIMESTAMP(3);
