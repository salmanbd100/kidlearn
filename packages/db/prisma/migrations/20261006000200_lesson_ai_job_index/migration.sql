-- The AI review gate and approval find rows by the job that wrote them, and Postgres
-- does not index a foreign key's referencing side on its own. CONCURRENTLY, alone in
-- its migration (backend.md §3).
CREATE INDEX CONCURRENTLY "Lesson_aiJobId_idx" ON "Lesson"("aiJobId");
