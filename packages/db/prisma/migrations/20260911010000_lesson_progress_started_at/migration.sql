-- When a lesson was first opened, which `updatedAt` cannot say: it moves on
-- every step report, so a "lesson under way" grace measured from it can be kept
-- alive indefinitely by re-reporting a step. `startedAt` is written once and
-- bounds that grace absolutely (screen-time.service.ts).
--
-- Additive with a default, so the previous release keeps working against it.
-- Existing rows take the migration time, which gives any lesson already in
-- progress one fresh ceiling rather than an expired one.

ALTER TABLE "LessonProgress"
  ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
