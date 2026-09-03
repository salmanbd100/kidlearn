-- File 35 — the picture brief the AI story generator writes for each page (FR-AI-02).
--
-- One nullable column. The generator writes an English scene description naming
-- which characters appear and how they look; file 36's image pipeline draws from
-- it and attaches the result to `illustrationAssetId`, leaving this in place so the
-- page can be redrawn.
--
-- A column rather than a value read back out of `AIGenerationJob.rawOutput`,
-- because it is editable content: a reviewer who rewrites a page's text has to be
-- able to rewrite its picture brief with it (file 37), and a JSONB audit record is
-- deliberately never rewritten.
--
-- No default and no backfill: every page written before this file was authored by
-- hand and has no prompt, which is exactly what NULL means here.
--
-- Written by hand, matching the offline convention of the earlier migrations in
-- this directory; it has not been applied to any database.

-- AlterTable
ALTER TABLE "StoryPage" ADD COLUMN     "illustrationPrompt" TEXT;
