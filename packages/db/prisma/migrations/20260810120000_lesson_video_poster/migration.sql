-- File 17 — the poster frame the video step shows before playback can start.
--
-- `LessonTranslation` carried the video asset but no still image, so the player
-- had nothing to paint over the first seconds of buffering (NFR-PERF-02) and a
-- child stared at a black rectangle. This adds the missing per-locale reference.
--
-- Additive and nullable: every existing row keeps a NULL poster, and the player
-- already renders the skeleton alone when there is none. Admin upload fills it
-- in (file 33).
--
-- Written offline against the schema diff; it has not yet been applied to any
-- database.

-- AlterTable
ALTER TABLE "LessonTranslation" ADD COLUMN "videoPosterAssetId" TEXT;

-- AddForeignKey
ALTER TABLE "LessonTranslation" ADD CONSTRAINT "LessonTranslation_videoPosterAssetId_fkey" FOREIGN KEY ("videoPosterAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
