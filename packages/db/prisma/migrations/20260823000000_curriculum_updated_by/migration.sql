-- File 32 — who last touched a piece of curriculum.
--
-- Every admin create, edit, reorder and status transition stamps this column with
-- the acting `AdminUser.id`, which is what makes a publish attributable: without
-- it the only record of who moved a lesson in front of a five-year-old is a
-- server log nobody keeps.
--
-- A plain nullable TEXT rather than a foreign key to `AdminUser`, deliberately.
-- An audit stamp has to outlive the account that made it — the same reasoning
-- that gave `AdminUser.authUserId` its `ON DELETE SET NULL` (file 31) — and a
-- foreign key here would offer only `SET NULL`, which erases exactly the fact
-- the column exists to keep, or `RESTRICT`, which makes a revoked admin
-- undeletable. The id is resolved to a name by a join in the CMS when it can be,
-- and shown as the raw id when the account is gone.
--
-- NULL means "before this column existed, or written by a seed", which is
-- distinct from every value an admin route can write.
--
-- Additive only: every existing row takes NULL.
--
-- Written by hand, matching the offline convention of the earlier migrations in
-- this directory; it has not been applied to any database.

-- AlterTable
ALTER TABLE "World" ADD COLUMN     "updatedBy" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "updatedBy" TEXT;

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "updatedBy" TEXT;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "updatedBy" TEXT;
