-- Bearer credentials for the MCP endpoint (FR-AI-10). A new table, so its indexes and
-- foreign key need none of backend.md §3's lock-avoidance.
CREATE TABLE "AdminAccessToken" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminAccessToken_tokenHash_key" ON "AdminAccessToken"("tokenHash");

CREATE INDEX "AdminAccessToken_adminId_idx" ON "AdminAccessToken"("adminId");

ALTER TABLE "AdminAccessToken" ADD CONSTRAINT "AdminAccessToken_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminAccessToken" ENABLE ROW LEVEL SECURITY;
