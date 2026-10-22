-- Who asked for a job and which source wrote it (FR-AI-08, FR-AI-10). Every new column is
-- nullable or has a constant default, so ADD COLUMN rewrites nothing. The foreign key is
-- NOT VALID here and validated in the next migration (backend.md §3); existing rows hold
-- NULL, so the validation has nothing to reject.

CREATE TYPE "AIJobSource" AS ENUM ('gemini', 'mcp');

ALTER TABLE "AIGenerationJob" ADD COLUMN "client" JSONB,
ADD COLUMN "clientRequestId" TEXT,
ADD COLUMN "requestedById" TEXT,
ADD COLUMN "source" "AIJobSource" NOT NULL DEFAULT 'gemini';

ALTER TABLE "AIGenerationJob" ADD CONSTRAINT "AIGenerationJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
