-- Step 2 of 20261022000000: its own migration, so the scan does not run inside the
-- transaction that took ADD CONSTRAINT's lock.
ALTER TABLE "AIGenerationJob" VALIDATE CONSTRAINT "AIGenerationJob_requestedById_fkey";
