-- File 31 — index `SessionEvent.occurredAt` on its own.
--
-- The admin analytics page counts children active today across the whole platform
-- (FR-CMS-07), which is the first query on this table with no `childId` to narrow
-- on. `SessionEvent_childId_occurredAt_idx` leads with `childId`, so a bare day
-- window cannot use it and Postgres falls back to a sequential scan over every
-- event ever recorded.
--
-- Additive only: an index, no column or constraint change, so no existing row or
-- query is affected.
--
-- Written by hand, matching the offline convention of the earlier migrations in
-- this directory; it has not been applied to any database.

-- CreateIndex
CREATE INDEX "SessionEvent_occurredAt_idx" ON "SessionEvent"("occurredAt");
