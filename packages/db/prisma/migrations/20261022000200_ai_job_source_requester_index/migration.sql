-- The per-admin MCP daily cap counts this admin's MCP jobs since midnight. CONCURRENTLY,
-- alone in its migration (backend.md §3).
CREATE INDEX CONCURRENTLY "AIGenerationJob_source_requestedById_createdAt_idx" ON "AIGenerationJob"("source", "requestedById", "createdAt");
