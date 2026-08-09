/**
 * Parental PIN and COPPA consent logic (FR-AUTH-03, FR-AUTH-04).
 *
 * No Express types cross this boundary — every function here is callable from a
 * test without an HTTP layer. Raw PINs are arguments only: they are never
 * logged, never returned, and never written anywhere but through `hashPin`.
 */
import type { Parent } from "@kidlearn/db";
import { CONSENT_VERSION } from "@kidlearn/types";
import { ApiError } from "../lib/errors.js";
import { hashPin, verifyPin } from "../lib/pin.js";
import { prisma } from "../lib/prisma.js";

/** How long one successful PIN entry keeps the parent area unlocked. */
export const PIN_GRANT_MS = 15 * 60_000;

/** Wrong entries allowed before the account cools off. */
const MAX_PIN_ATTEMPTS = 5;

/** The first cool-off window. Every wrong entry past the fifth doubles it. */
const PIN_LOCKOUT_BASE_MS = 60_000;

/** Ceiling on that doubling, so a forgetful parent is not locked out for a day. */
const PIN_LOCKOUT_MAX_MS = 60 * 60_000;

/**
 * How long the cool-off lasts after `failedCount` consecutive wrong entries.
 *
 * A 4-digit PIN has 10,000 values, so a fixed window that also resets the
 * counter is not a defence: five guesses per minute walks the whole space in
 * about 33 hours. The counter now survives the lockout — only a correct PIN
 * clears it — so each further guess costs double the last: 1 min, 2, 4, 8 …
 * capped at an hour. An attacker gets ~5 free guesses and then a handful more
 * per day; the parent who mistyped twice notices nothing.
 */
function lockoutMsFor(failedCount: number): number {
  const doublings = Math.max(0, failedCount - MAX_PIN_ATTEMPTS);
  return Math.min(PIN_LOCKOUT_BASE_MS * 2 ** doublings, PIN_LOCKOUT_MAX_MS);
}

export type PinGrant = { pinVerifiedUntil: Date };

export type GateStatus = {
  hasPin: boolean;
  isPinVerified: boolean;
  pinVerifiedUntil: Date | null;
};

/**
 * Reports whether the parent area is currently open, without opening it.
 *
 * A pure function of the two rows the request already carries — no query, no
 * write. `requirePinVerified` applies exactly this logic to decide between
 * `PIN_REQUIRED`, `PIN_VERIFICATION_REQUIRED` and letting the request through;
 * this is that decision made available as a read, so the client can render the
 * right screen on first paint instead of provoking a 403 to find out.
 *
 * A lapsed `pinVerifiedUntil` is reported as `null` rather than as a past
 * timestamp: the only question a client has is "is it open, and until when", and
 * a stale expiry invites a client to subtract two clocks to answer it.
 */
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
  pin: string,
  currentPin?: string,
): Promise<void> {
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
      // A successful change is proof of possession, so the guard resets.
      pinFailedCount: 0,
      pinLockedUntil: null,
    },
  });
}

/**
 * Checks the PIN and, on success, extends the session's grant.
 *
 * The grant is written straight onto the better-auth `Session` row. better-auth
 * exposes no server-side helper for updating a session's additional fields
 * (`updateSession` on the public API is client-driven and refuses fields
 * declared `input: false`), and the Prisma adapter stores those fields as plain
 * columns — so this is the same write it would perform. Session cookie caching
 * is off, so the next request re-reads the row and sees the new value.
 */
export async function verifyParentPinForSession(
  parent: Parent,
  sessionId: string,
  pin: string,
): Promise<PinGrant> {
  const isCorrect = await consumePinAttempt(parent, pin);
  if (!isCorrect) {
    throw new ApiError(403, "PIN_INVALID", "Incorrect PIN");
  }

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
 *
 * A mismatched version is a conflict rather than a silent acceptance — the
 * client would otherwise record agreement to text the parent never saw.
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

/**
 * One PIN comparison plus its brute-force bookkeeping. Shared by "verify" and
 * "change", because the change endpoint is an equally good guessing oracle.
 *
 * Throws `PIN_LOCKED` (429) while a cool-off is running and `PIN_REQUIRED`
 * (403) when there is no PIN to compare against; otherwise returns the result
 * and leaves the caller to decide which error a mismatch deserves.
 */
async function consumePinAttempt(
  parent: Parent,
  pin: string,
): Promise<boolean> {
  if (parent.pinLockedUntil && parent.pinLockedUntil.getTime() > Date.now()) {
    throw new ApiError(
      429,
      "PIN_LOCKED",
      "Too many incorrect attempts — try again shortly",
    );
  }

  if (!parent.pinHash) {
    throw new ApiError(403, "PIN_REQUIRED", "No parental PIN is set");
  }

  if (await verifyPin(parent.pinHash, pin)) {
    await prisma.parent.update({
      where: { id: parent.id },
      data: { pinFailedCount: 0, pinLockedUntil: null },
    });
    return true;
  }

  // Postgres does the arithmetic, not this process. `parent` is the snapshot
  // `requireParent` read at the start of *this* request, so computing
  // `pinFailedCount + 1` in JS is a lost update: fire N wrong PINs in parallel
  // and every one of them reads 0, writes 1, and the lockout never trips —
  // the whole 10,000-value space falls in a single burst. `increment` is atomic
  // and the returned row is the authority on where this attempt landed.
  const { pinFailedCount } = await prisma.parent.update({
    where: { id: parent.id },
    data: { pinFailedCount: { increment: 1 } },
    select: { pinFailedCount: true },
  });

  if (pinFailedCount >= MAX_PIN_ATTEMPTS) {
    await prisma.parent.update({
      where: { id: parent.id },
      data: {
        pinLockedUntil: new Date(Date.now() + lockoutMsFor(pinFailedCount)),
      },
    });
  }

  return false;
}
