-- Follow-along narration timings for a story page (file 26, FR-STORY-02).
--
-- Additive and nullable: every existing row keeps a NULL, which is what all MVP
-- content will hold until the voice pipeline (file 36) produces spans. The reader
-- ships the render path now so that highlighting a story later is a data change
-- rather than a second reading screen written against a different component.
--
-- The column sits on the translation row rather than on `MediaAsset` because a
-- span is a pair of character offsets into *this row's* `text`. An asset shared
-- between an English row and a Bangla one would carry offsets that fit neither.
--
-- Written by hand, matching the offline convention of the earlier migrations; it
-- has not been applied to any database.

-- The moral read aloud, for the reader's finish screen (FR-STORY-03), added in
-- the same migration for the same reason: it is the one line of a story that
-- exists only as text. The pages carry narration and the cover carries its title
-- spoken, so without this the lesson of the story is the single thing a
-- pre-reader cannot receive. Nullable like every other recording — a story is
-- publishable before the voice pipeline reaches it.

-- AlterTable
ALTER TABLE "StoryPageTranslation" ADD COLUMN     "narrationTimings" JSONB;

-- AlterTable
ALTER TABLE "StoryTranslation" ADD COLUMN     "moralAudioAssetId" TEXT;

-- AddForeignKey
ALTER TABLE "StoryTranslation" ADD CONSTRAINT "StoryTranslation_moralAudioAssetId_fkey" FOREIGN KEY ("moralAudioAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
