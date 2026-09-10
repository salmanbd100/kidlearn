-- The parental PIN gate is removed (was FR-AUTH-04). The parent area is reached
-- by Google sign-in alone; account deletion is guarded by its single-use
-- confirmation token, which stays.
--
-- Irreversible: the hashes and lockout counters are dropped, not archived.
-- Nothing reads them, so no data migration precedes this.
ALTER TABLE "Parent"
  DROP COLUMN "pinHash",
  DROP COLUMN "pinFailedCount",
  DROP COLUMN "pinLockoutStrikes",
  DROP COLUMN "pinLockedUntil";

ALTER TABLE "session" DROP COLUMN "pinVerifiedUntil";
