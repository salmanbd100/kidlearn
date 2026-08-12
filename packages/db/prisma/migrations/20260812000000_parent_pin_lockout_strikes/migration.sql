-- Parent.pinLockoutStrikes — the escalation depth of the PIN brute-force guard.
--
-- `pinFailedCount` (file 10) previously carried two meanings at once: the
-- allowance inside the current window *and* how far the doubling had escalated.
-- Those are forgiven at different times, so the guard could not both bound a
-- concurrent burst and still let a legitimate parent back in after a cool-off.
-- Splitting them is what makes the slot claim in `parentSecurityService`
-- expressible as one atomic conditional UPDATE.
--
-- Existing rows start at 0. That is deliberately lenient rather than derived
-- from the current `pinFailedCount`: no production data exists yet, and reading
-- a strike count out of a counter that meant something else would be a guess.
--
-- Written by hand, matching the offline convention of the file 10 migration; it
-- has not been applied to any database.

-- AlterTable
ALTER TABLE "Parent" ADD COLUMN     "pinLockoutStrikes" INTEGER NOT NULL DEFAULT 0;
