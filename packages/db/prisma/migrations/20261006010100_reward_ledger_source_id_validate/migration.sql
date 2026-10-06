-- Step 2 of 3 (see 20261006010000): its own migration, so the scan does not run inside
-- the transaction that took ADD CONSTRAINT's ACCESS EXCLUSIVE lock.
ALTER TABLE "RewardLedger" VALIDATE CONSTRAINT "RewardLedger_sourceId_not_null";
