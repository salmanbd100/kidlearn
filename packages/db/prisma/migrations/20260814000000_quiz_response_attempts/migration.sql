-- File 22 — QuizResponse.attempts, how many taps a question took.
--
-- `isCorrect` (file 06) records only whether the *first* attempt was right,
-- because that is what scoring reads: a quiz here has no fail state, so every
-- question ends correct and "did they get there" carries no information. That
-- leaves a child who answered instantly and one who tried three options
-- indistinguishable on the row, which is the difference a parent's accuracy
-- report (file 29) is actually about.
--
-- Additive only. Existing rows take the default of 1 — the lowest value the
-- schema allows and the truthful one for a row written before the column
-- existed, since a recorded answer was tapped at least once.
--
-- Written by hand, matching the offline convention of the earlier migrations in
-- this directory; it has not been applied to any database.

-- AlterTable
ALTER TABLE "QuizResponse" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 1;
