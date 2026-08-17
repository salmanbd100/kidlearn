-- Child-facing story titles and morals, per locale (file 25, FR-STORY-05).
--
-- `Story.title` and `Story.theme` stay where they are and keep their meaning: the
-- admin label a CMS list and a slug are built from, and the authoring label for
-- the moral. What is new is the child-facing pair beside them, resolved with the
-- same `preferredLanguage → en → the row's own label` fallback the curriculum
-- name translations already use.
--
-- Why file 25 and not file 05: `document/database-design.md` recorded the gap when
-- the schema settled — "`Story.title` is not translated yet. Stories are files
-- 25–26; when they land, follow the same pattern rather than reading `Story.title`
-- directly." Without this table the library screen would show a Bangla learner
-- English covers over Bangla page text, which is the defect
-- `curriculum_name_translations` fixed for lesson tiles.
--
-- `titleAudioAssetId` is the title read aloud, which is how a pre-reader finds out
-- what a cover says before opening it (NFR-A11Y-01). Nullable: the voice pipeline
-- (file 36) records it, and a story is publishable before its narration exists.
-- `moral` is nullable for the same reason a translation row can exist before every
-- field on it does.
--
-- The table starts empty. The resolver falls back to `Story.title` / `Story.theme`
-- until content is translated, so nothing becomes nameless in the meantime.
--
-- Written by hand, matching the offline convention of the earlier migrations; it
-- has not been applied to any database.

-- CreateTable
CREATE TABLE "StoryTranslation" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "title" TEXT NOT NULL,
    "moral" TEXT,
    "titleAudioAssetId" TEXT,

    CONSTRAINT "StoryTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoryTranslation_storyId_language_key" ON "StoryTranslation"("storyId", "language");

-- AddForeignKey
ALTER TABLE "StoryTranslation" ADD CONSTRAINT "StoryTranslation_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryTranslation" ADD CONSTRAINT "StoryTranslation_titleAudioAssetId_fkey" FOREIGN KEY ("titleAudioAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
