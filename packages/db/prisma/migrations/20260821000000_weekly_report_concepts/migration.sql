-- File 30 — Lesson.conceptsIntroduced, and an index for the weekly window.
--
-- `conceptsIntroduced` is what makes FR-DASH-05's "new letters, words and numbers
-- this week" answerable at all. The report unions these tokens across the lessons
-- whose *first* completion fell inside the week, so "new" is a fact about the
-- child's history rather than a second table nobody maintains.
--
-- Prefixed tokens (`letter:A`, `word:apple`, `number:7`) rather than three
-- columns: the prefix set is closed today and the aggregator ignores anything it
-- does not recognise, so adding a fourth kind of concept later is a seed change
-- and not a migration. A text array rather than a join table because the only
-- read is "all of them for this lesson" — there is no query that filters by one
-- token.
--
-- Additive only. Existing rows take the empty-array default, which is the truthful
-- value for a lesson written before anybody recorded what it teaches: the report
-- then counts no new concepts for it rather than inventing some.
--
-- The `LessonProgress` index is the other half. The report selects one child's
-- completions inside `[weekStart, weekStart + 7d)`; the table's only index is the
-- `(childId, lessonId)` unique, so without this every generated report scans that
-- child's entire completion history.
--
-- Written by hand, matching the offline convention of the earlier migrations in
-- this directory; it has not been applied to any database.

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "conceptsIntroduced" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "LessonProgress_childId_completedAt_idx" ON "LessonProgress"("childId", "completedAt");
