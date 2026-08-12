-- File 16 — the lesson player's per-step SessionEvent marker.
--
-- `SessionEventType` (file 06) carried only `lesson_start` and `lesson_complete`,
-- so an abandoned lesson recorded nothing between its two endpoints. Files 16, 17
-- and 27 all specify a `step_complete` event; this adds the missing enum value.
--
-- Additive only: no existing row changes, and no column is rewritten. Postgres
-- appends the label after `lesson_start` so the enum's declared order still
-- follows a lesson's real sequence.
--
-- Generated offline with `prisma migrate diff --from-schema-datamodel …`; it has
-- not yet been applied to any database.

-- AlterEnum
ALTER TYPE "SessionEventType" ADD VALUE 'step_complete' AFTER 'lesson_start';
