-- `RewardLedger.sourceId` must be non-null: Postgres treats NULLs as distinct in the
-- `(childId, rewardType, sourceType, sourceId)` unique index, so a NULL grant escapes
-- the idempotency guard. Three migrations, so no step holds a write-blocking lock
-- while it scans the table (backend.md §3):
--
--   1. this one: backfill, then a CHECK that is NOT VALID — instant, enforced on new rows;
--   2. VALIDATE — scans under SHARE UPDATE EXCLUSIVE, which does not block writes;
--   3. SET NOT NULL — Postgres skips the scan because the valid CHECK proves it.
--
-- Every writer has always set `sourceId`. A row that escaped is given its own id, which
-- is unique, so it keeps its place in the balance and cannot collide with a real grant.
UPDATE "RewardLedger" SET "sourceId" = "id" WHERE "sourceId" IS NULL;

ALTER TABLE "RewardLedger"
  ADD CONSTRAINT "RewardLedger_sourceId_not_null" CHECK ("sourceId" IS NOT NULL) NOT VALID;
