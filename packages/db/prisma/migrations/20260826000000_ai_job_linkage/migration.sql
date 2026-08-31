-- File 34 — which AI job produced a content row (FR-AI-07 groundwork, FR-AI-08).
--
-- Six nullable columns, one per model a generator can create. NULL means a person
-- authored the row, which is every row that exists today; a generator writes the
-- creating job's id into every entity it inserts, inside the same transaction.
--
-- A real foreign key rather than a bare id, and one column per table rather than a
-- polymorphic join table. File 37 extends `assertTransition` so a row carrying
-- `aiJobId` cannot reach `published` unless that job was approved by a human
-- reviewer — a guard that is only worth writing if the database itself refuses to
-- hold an id no job has. A polymorphic table could not be enforced that way.
--
-- `ON DELETE SET NULL` on every one: a deleted job must not delete content an
-- admin has since edited and approved. Losing the provenance degrades the row to
-- "human-authored", which is the safe direction — file 37's guard only ever
-- *blocks* on a job, so a NULL cannot let unreviewed content through that a
-- populated column would have stopped. `ON UPDATE CASCADE` matches the convention
-- Prisma generates for the rest of this schema; job ids are uuids and never change.
--
-- No index on the columns. The queries that read them are "load this row, is it
-- generated?" — an id lookup on the owning table — and file 37's queue lists jobs,
-- then follows the relation outward. An index per table would cost six writes on
-- every content insert to serve a scan nobody performs.
--
-- Additive only: every existing row takes NULL.
--
-- Written by hand, matching the offline convention of the earlier migrations in
-- this directory; it has not been applied to any database.

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "aiJobId" TEXT;

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "aiJobId" TEXT;

-- AlterTable
ALTER TABLE "QuizQuestion" ADD COLUMN     "aiJobId" TEXT;

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "aiJobId" TEXT;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "aiJobId" TEXT;

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "aiJobId" TEXT;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "AIGenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "AIGenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "AIGenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "AIGenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "AIGenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "AIGenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
