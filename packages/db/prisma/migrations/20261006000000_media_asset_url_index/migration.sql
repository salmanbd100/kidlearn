-- Every publish guard looks up the payload's asset URLs with `url IN (...)`, and
-- MediaAsset grows with every AI narration and illustration. Alone in its migration
-- because CONCURRENTLY cannot run inside the implicit transaction of a multi-statement
-- script (backend.md §3).
CREATE INDEX CONCURRENTLY "MediaAsset_url_idx" ON "MediaAsset"("url");
