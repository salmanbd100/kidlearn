-- Child-facing curriculum names, per locale.
--
-- `World.name`, `Subject.name`, `Topic.name` and `Lesson.title` stay where they
-- are and keep their meaning: the internal label a CMS list, an audit trail and a
-- slug are built from. What is new is the child-facing string beside them, which
-- the read API resolves with the same `preferredLanguage → en` fallback it already
-- applies to `LessonTranslation.introScript`.
--
-- The gap this closes: the response contract in `packages/types/src/api/content.ts`
-- has always promised a single string already resolved to the child's language,
-- and the schema had only the untranslated column to supply it. A Bangla learner
-- therefore heard Bangla narration inside a lesson whose tile, topic, subject and
-- world were all named in English.
--
-- `LessonTranslation.title` is backfilled from `Lesson.title` rather than added as
-- a nullable column: every existing translation row belongs to a lesson that
-- already has a title, so there is a correct value for each, and a NOT NULL column
-- means the read path never has to ask whether a published lesson has a name. The
-- three new tables start empty — the resolver falls back to the row's own label
-- until content is translated, so nothing becomes nameless in the meantime.
--
-- Written by hand, matching the offline convention of the earlier migrations; it
-- has not been applied to any database.

-- AlterTable
ALTER TABLE "LessonTranslation" ADD COLUMN     "title" TEXT;

UPDATE "LessonTranslation" AS lt
SET "title" = l."title"
FROM "Lesson" AS l
WHERE lt."lessonId" = l."id" AND lt."title" IS NULL;

ALTER TABLE "LessonTranslation" ALTER COLUMN "title" SET NOT NULL;

-- CreateTable
CREATE TABLE "WorldTranslation" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "WorldTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectTranslation" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SubjectTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicTranslation" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "TopicTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorldTranslation_worldId_language_key" ON "WorldTranslation"("worldId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectTranslation_subjectId_language_key" ON "SubjectTranslation"("subjectId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "TopicTranslation_topicId_language_key" ON "TopicTranslation"("topicId", "language");

-- AddForeignKey
ALTER TABLE "WorldTranslation" ADD CONSTRAINT "WorldTranslation_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectTranslation" ADD CONSTRAINT "SubjectTranslation_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicTranslation" ADD CONSTRAINT "TopicTranslation_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
