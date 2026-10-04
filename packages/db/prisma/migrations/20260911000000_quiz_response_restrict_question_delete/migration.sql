-- A child's answers outlive the question they answered (NFR-SAFE-05 covers
-- erasing a child, not editing a quiz).
--
-- `QuizResponse.questionId` cascaded, so deleting a question in the CMS silently
-- erased every child's answer to it, which in turn changed the
-- `quiz_correct_in_topic` badge counts and the accuracy a weekly report is
-- derived from. RESTRICT makes the database refuse instead; the service answers
-- 409 before it gets that far. The `ChildProfile` cascade is untouched, so
-- account deletion still removes the answers.

ALTER TABLE "QuizResponse" DROP CONSTRAINT "QuizResponse_questionId_fkey";

ALTER TABLE "QuizResponse"
  ADD CONSTRAINT "QuizResponse_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
