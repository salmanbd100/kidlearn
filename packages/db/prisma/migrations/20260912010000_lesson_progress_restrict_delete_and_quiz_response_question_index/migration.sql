-- Two changes that share a cause: a delete in the CMS reaching a child's data.
--
-- 1. `LessonProgress.lessonId` cascaded, so one `lesson.delete` — or a `topic`,
--    `subject` delete further up the same chain, from Prisma Studio or a reseed —
--    silently erased every child's progress on it, along with the completion the
--    streak and badges are derived from. It is the same defect the quiz-response
--    migration fixed for questions. No route deletes content today, so this is
--    latent; RESTRICT keeps it that way. The `ChildProfile` cascade is untouched,
--    so account deletion (NFR-SAFE-05) still removes the progress rows.
--
-- 2. `QuizResponse.questionId` has a RESTRICT foreign key and a service-side
--    `count({ where: { questionId } })`, and neither had an index: both scanned
--    the fastest-growing table in the schema.

ALTER TABLE "LessonProgress" DROP CONSTRAINT "LessonProgress_lessonId_fkey";

ALTER TABLE "LessonProgress"
  ADD CONSTRAINT "LessonProgress_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "QuizResponse_questionId_idx" ON "QuizResponse"("questionId");
