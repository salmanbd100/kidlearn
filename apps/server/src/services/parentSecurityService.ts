/** Parental PIN and COPPA consent logic (FR-AUTH-03, FR-AUTH-04). */
// `Prisma` is a value import, not a type-only one: the known-request-error class
// below is a runtime member of the namespace.
import { type Parent, Prisma } from "@kidlearn/db";
import { CONSENT_VERSION } from "@kidlearn/types";
import { ApiError } from "../lib/errors.js";
import { hashPin, verifyPin } from "../lib/pin.js";
import { prisma } from "../lib/prisma.js";

/** How long one successful PIN entry keeps the parent area unlocked. */
export const PIN_GRANT_MS = 15 * 60_000;

/** Wrong entries allowed before the account first cools off. */
const MAX_PIN_ATTEMPTS = 5;

/** The first cool-off window. Every cool-off after it doubles. */
const PIN_LOCKOUT_BASE_MS = 60_000;

/** Ceiling on that doubling, so a forgetful parent is not locked out for a day. */
const PIN_LOCKOUT_MAX_MS = 60 * 60_000;

/** How long the cool-off lasts after `strikes` consecutive cool-offs. */
function lockoutMsFor(strikes: number): number {
  const doublings = Math.max(0, strikes - 1);
  return Math.min(PIN_LOCKOUT_BASE_MS * 2 ** doublings, PIN_LOCKOUT_MAX_MS);
}

/** Prisma's "no row matched the filter" — a conditional write that lost its race. */
function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

export type PinGrant = { pinVerifiedUntil: Date };

export type GateStatus = {
  hasPin: boolean;
  isPinVerified: boolean;
  pinVerifiedUntil: Date | null;
};

/** Reports whether the parent area is currently open, without opening it. */
export function readGateStatus(
  parent: Pick<Parent, "pinHash">,
  session: { pinVerifiedUntil?: Date | string | null },
  now: Date = new Date(),
): GateStatus {
  // `Date | string`, not just `Date`: better-auth types this additional field as
  // a date but hands back whatever its adapter produced, and
  // `requirePinVerified` already wraps it in `new Date(...)` for the same
  // reason. Normalising once here keeps the comparison honest.
  const raw = session.pinVerifiedUntil ?? null;
  const until = raw === null ? null : new Date(raw);
  const isPinVerified =
    parent.pinHash !== null &&
    until !== null &&
    !Number.isNaN(until.getTime()) &&
    until.getTime() > now.getTime();

  return {
    hasPin: parent.pinHash !== null,
    isPinVerified,
    pinVerifiedUntil: isPinVerified ? until : null,
  };
}

export type ConsentRecord = {
  consentGivenAt: Date;
  consentVersion: string;
};

/**
 * Sets or replaces the parental PIN. Replacing one requires the current PIN:
 * without that, anyone who found an unattended unlocked session could lock the
 * real parent out of their own dashboard.
 */
export async function setParentPin(
  parent: Parent,
  sessionId: string,
  pin: string,
  currentPin?: string,
): Promise<PinGrant> {
  if (parent.pinHash) {
    if (!currentPin) {
      throw ApiError.forbidden("Current PIN is required to change the PIN");
    }
    const isCurrentPinCorrect = await consumePinAttempt(parent, currentPin);
    if (!isCurrentPinCorrect) {
      throw ApiError.forbidden("Current PIN is incorrect");
    }
  }

  await prisma.parent.update({
    where: { id: parent.id },
    data: {
      pinHash: await hashPin(pin),
      // A successful change is proof of possession, so the guard resets — both
      // the window allowance and the escalation depth behind it.
      pinFailedCount: 0,
      pinLockoutStrikes: 0,
      pinLockedUntil: null,
    },
  });

  return grantPinToSession(sessionId);
}

/** Checks the PIN and, on success, extends the session's grant. */
export async function verifyParentPinForSession(
  parent: Parent,
  sessionId: string,
  pin: string,
): Promise<PinGrant> {
  const isCorrect = await consumePinAttempt(parent, pin);
  if (!isCorrect) {
    throw new ApiError(403, "PIN_INVALID", "Incorrect PIN");
  }

  return grantPinToSession(sessionId);
}

/** The one place the grant is written. Shared by "verify" and "set". */
async function grantPinToSession(sessionId: string): Promise<PinGrant> {
  const pinVerifiedUntil = new Date(Date.now() + PIN_GRANT_MS);
  await prisma.session.update({
    where: { id: sessionId },
    data: { pinVerifiedUntil },
  });

  return { pinVerifiedUntil };
}

/**
 * Records COPPA consent (FR-AUTH-03, NFR-SAFE-03). Idempotent: re-posting the
 * current version refreshes the timestamp, which is the honest record of the
 * last time the parent actively agreed.
 */
export async function recordParentConsent(
  parent: Parent,
  version: string,
): Promise<ConsentRecord> {
  if (version !== CONSENT_VERSION) {
    throw ApiError.conflict("consent version outdated", {
      currentVersion: CONSENT_VERSION,
    });
  }

  const consentGivenAt = new Date();
  await prisma.parent.update({
    where: { id: parent.id },
    data: { consentGivenAt, consentVersion: CONSENT_VERSION },
  });

  return { consentGivenAt, consentVersion: CONSENT_VERSION };
}

const PIN_LOCKED = new ApiError(
  429,
  "PIN_LOCKED",
  "Too many incorrect attempts — try again shortly",
);

/**
 * One PIN comparison plus its brute-force bookkeeping. Shared by "verify" and
 * "change", because the change endpoint is an equally good guessing oracle.
 */
async function consumePinAttempt(
  parent: Parent,
  pin: string,
): Promise<boolean> {
  if (!parent.pinHash) {
    throw new ApiError(403, "PIN_REQUIRED", "No parental PIN is set");
  }

  const now = new Date();
  await restoreOneAttempt(parent.id, now);

  const claimed = await claimAttemptSlot(parent.id);
  if (claimed === null) {
    await armLockout(parent.id, now);
    throw PIN_LOCKED;
  }

  if (await verifyPin(parent.pinHash, pin)) {
    await prisma.parent.update({
      where: { id: parent.id },
      data: { pinFailedCount: 0, pinLockoutStrikes: 0, pinLockedUntil: null },
    });
    return true;
  }

  // Armed here rather than on the next attempt so the server, `gate-status` and
  // the PIN pad agree about the lockout the moment it starts.
  if (claimed >= MAX_PIN_ATTEMPTS) {
    await armLockout(parent.id, now);
  }

  return false;
}

/** Gives back a single attempt once a cool-off has been served. */
async function restoreOneAttempt(parentId: string, now: Date): Promise<void> {
  await prisma.parent.updateMany({
    where: { id: parentId, pinLockedUntil: { lte: now } },
    data: { pinFailedCount: MAX_PIN_ATTEMPTS - 1, pinLockedUntil: null },
  });
}

/**
 * Consumes one attempt from the current window, returning the count this attempt
 * landed on — or `null` when the window is exhausted or a cool-off is running.
 */
async function claimAttemptSlot(parentId: string): Promise<number | null> {
  try {
    const { pinFailedCount } = await prisma.parent.update({
      where: {
        id: parentId,
        pinLockedUntil: null,
        pinFailedCount: { lt: MAX_PIN_ATTEMPTS },
      },
      data: { pinFailedCount: { increment: 1 } },
      select: { pinFailedCount: true },
    });
    return pinFailedCount;
  } catch (error) {
    if (isRecordNotFound(error)) return null;
    throw error;
  }
}

/** Starts a cool-off and deepens the escalation by one strike. */
async function armLockout(parentId: string, now: Date): Promise<void> {
  let strikes: number;
  try {
    const struck = await prisma.parent.update({
      where: {
        id: parentId,
        OR: [{ pinLockedUntil: null }, { pinLockedUntil: { lte: now } }],
      },
      data: { pinLockoutStrikes: { increment: 1 } },
      select: { pinLockoutStrikes: true },
    });
    strikes = struck.pinLockoutStrikes;
  } catch (error) {
    if (isRecordNotFound(error)) return;
    throw error;
  }

  await prisma.parent.update({
    where: { id: parentId },
    data: { pinLockedUntil: new Date(now.getTime() + lockoutMsFor(strikes)) },
  });
}
