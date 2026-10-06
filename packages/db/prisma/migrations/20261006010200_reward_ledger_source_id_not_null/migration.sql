-- Step 3 of 3 (see 20261006010000): the validated CHECK lets SET NOT NULL skip its scan,
-- after which the CHECK says nothing the column does not.
ALTER TABLE "RewardLedger" ALTER COLUMN "sourceId" SET NOT NULL;

ALTER TABLE "RewardLedger" DROP CONSTRAINT "RewardLedger_sourceId_not_null";
