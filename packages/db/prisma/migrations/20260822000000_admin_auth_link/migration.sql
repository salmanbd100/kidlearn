-- File 31 — link an `AdminUser` to the better-auth identity it signs in with.
--
-- Admins share the one better-auth instance parents use (see the note at the top
-- of apps/server/src/lib/auth.ts for why a second instance was rejected). What
-- keeps the two principals disjoint (spec §4.3) is this column and nothing else:
-- `requireAdmin` demands an `AdminUser` row for the session's user id, and
-- `requireParent` demands a `Parent` row with a Google account, so neither guard
-- can be satisfied by the other's session.
--
-- Nullable, because the `AdminUser` row is what *makes* somebody an admin and it
-- may exist before — or outlive — the credential user it points at. A row with a
-- NULL link simply cannot sign in, which is the right state for a revoked admin
-- whose review history has to survive.
--
-- `ON DELETE SET NULL` rather than `CASCADE`: `AIGenerationJob.reviewerId`
-- references `AdminUser`, and an audit trail that loses its reviewer to an
-- identity deletion is worse than one naming a disabled account (FR-AI-08).
--
-- Additive only: every existing row takes NULL, and there are no admins yet.
--
-- Written by hand, matching the offline convention of the earlier migrations in
-- this directory; it has not been applied to any database.

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "authUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_authUserId_key" ON "AdminUser"("authUserId");

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
