-- A retried MCP tool call carries the same clientRequestId and must find the first job, not
-- create a second. Existing rows hold NULL, which Postgres treats as distinct, so the build
-- cannot fail on them. CONCURRENTLY, alone in its migration (backend.md §3).
CREATE UNIQUE INDEX CONCURRENTLY "AIGenerationJob_requestedById_clientRequestId_key" ON "AIGenerationJob"("requestedById", "clientRequestId");
