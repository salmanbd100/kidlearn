-- Indexes behind the content-safety filter.
--
-- Every student-facing query filters `status = 'published'` and, for the
-- grade-tagged models, `gradeLevels @> ARRAY[...]` (`backend.md §4`). Neither
-- column was indexed on any of them: `Story` carried no index at all beyond its
-- primary key and slug, so the Story Library was a sequential scan plus a sort.
-- The `gradeLevels` indexes are GIN because the query is array containment.

CREATE INDEX "World_status_idx" ON "World"("status");

CREATE INDEX "Subject_status_sortOrder_idx" ON "Subject"("status", "sortOrder");
CREATE INDEX "Subject_gradeLevels_idx" ON "Subject" USING GIN ("gradeLevels");

CREATE INDEX "Topic_status_idx" ON "Topic"("status");
CREATE INDEX "Topic_gradeLevels_idx" ON "Topic" USING GIN ("gradeLevels");

CREATE INDEX "Lesson_status_idx" ON "Lesson"("status");
CREATE INDEX "Lesson_gradeLevels_idx" ON "Lesson" USING GIN ("gradeLevels");

CREATE INDEX "Story_status_worldId_idx" ON "Story"("status", "worldId");
CREATE INDEX "Story_gradeLevels_idx" ON "Story" USING GIN ("gradeLevels");

-- `session.activeChildProfileId` becomes a real foreign key (FR-AUTH-06).
--
-- It was a bare text column, and `deleteChildProfile` cleared it by hand inside
-- a transaction before deleting the row. That was correct, but it made the
-- invariant a thing every future caller had to remember; `ON DELETE SET NULL`
-- makes the database keep it. Any row already pointing at a deleted profile is
-- cleared first, or the constraint cannot be added.

UPDATE "session"
SET "activeChildProfileId" = NULL
WHERE "activeChildProfileId" IS NOT NULL
  AND "activeChildProfileId" NOT IN (SELECT "id" FROM "ChildProfile");

CREATE INDEX "session_activeChildProfileId_idx" ON "session"("activeChildProfileId");

ALTER TABLE "session"
  ADD CONSTRAINT "session_activeChildProfileId_fkey"
  FOREIGN KEY ("activeChildProfileId") REFERENCES "ChildProfile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
