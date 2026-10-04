-- Two reads that had no index to serve them.
--
-- The admin analytics overview counts lesson completions across *all* children in
-- a window; `LessonProgress(childId, completedAt)` leads with `childId`, so it
-- cannot serve a predicate on `completedAt` alone and the query scanned the table.
--
-- The media library lists by `kind` newest-first, and every AI illustration or
-- narration adds a row (per page, per language), so `MediaAsset` grows fastest of
-- the CMS tables and had no index at all.

CREATE INDEX "LessonProgress_completedAt_idx" ON "LessonProgress"("completedAt");

CREATE INDEX "MediaAsset_kind_createdAt_idx" ON "MediaAsset"("kind", "createdAt");
