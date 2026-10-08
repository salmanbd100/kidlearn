-- A quiz belongs to at most one lesson.
--
-- `POST /api/progress/quizzes/:quizId/responses` resolves the lesson from the quiz
-- alone, so two lessons sharing one quiz made it pick either of them: a child's
-- score and `LessonProgress` could land on the lesson they were not playing. The
-- route cannot name the lesson without an API change, so the schema now refuses
-- the shape instead. The unique index also serves that lookup, which had none.
--
-- Fails loudly if a quiz is already shared, rather than silently unlinking one
-- lesson from its quiz: resolve it by hand (give each lesson its own quiz), then
-- re-run.
DO $$
DECLARE
  shared integer;
BEGIN
  SELECT count(*) INTO shared FROM (
    SELECT "quizId" FROM "Lesson" WHERE "quizId" IS NOT NULL
    GROUP BY "quizId" HAVING count(*) > 1
  ) AS dupes;
  IF shared > 0 THEN
    RAISE EXCEPTION 'Cannot add unique Lesson.quizId: % quiz(zes) are linked to more than one lesson', shared;
  END IF;
END $$;

CREATE UNIQUE INDEX "Lesson_quizId_key" ON "Lesson"("quizId");
