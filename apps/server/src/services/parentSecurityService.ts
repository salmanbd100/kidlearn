/**
 * Parental PIN and COPPA consent logic (FR-AUTH-03, FR-AUTH-04).
 *
 * No Express types cross this boundary — every function here is callable from a
 * test without an HTTP layer. Raw PINs are arguments only: they are never
 * logged, never returned, and never written anywhere but through `hashPin`.
 */
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

/**
 * How long the cool-off lasts after `strikes` consecutive cool-offs.
 *
 * A 4-digit PIN has 10,000 values, so a fixed window that also forgives the
 * escalation is not a defence: five guesses per minute walks the whole space in
 * about 33 hours. `pinLockoutStrikes` survives every cool-off — only a correct
 * PIN clears it — so each window costs double the last: 1 min, 2, 4, 8 … capped
 * at an hour. Combined with `restoreOneAttempt` below, an attacker gets five
 * free guesses and then one per escalating window; the parent who mistyped twice
 * notices nothing.
 */
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
 *
 * Opens the grant on success, and returns it. Choosing a PIN *is* possession of
 * it — the parent typed it twice a moment ago — so demanding they immediately
 * type it a third time to get through the gate would be a prompt that verifies
 * nothing. It also has a load-bearing consequence: `POST /api/children` sits
 * behind `requirePinVerified`, and onboarding runs PIN setup one screen before
 * the first-profile form, so without this grant the flow would deadlock on a gate
 * the parent had just satisfied.
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

const PIN_LOCKED = new ApiError(
  429,
  "PIN_LOCKED",
  "Too many incorrect attempts — try again shortly",
);

/**
 * One PIN comparison plus its brute-force bookkeeping. Shared by "verify" and
 * "change", because the change endpoint is an equally good guessing oracle.
 *
 * Throws `PIN_LOCKED` (429) while a cool-off is running and `PIN_REQUIRED`
 * (403) when there is no PIN to compare against; otherwise returns the result
 * and leaves the caller to decide which error a mismatch deserves.
 *
 * ## Why the slot is claimed before the PIN is compared
 *
 * `parent` is the snapshot `requireParent` read at the *start* of this request.
 * Reading the lockout from it and then deciding is a check-then-act race: fire N
 * wrong PINs in parallel and every one of them sees `pinLockedUntil: null`, every
 * one of them is compared, and the cool-off is armed N times after the fact. An
 * atomic `{ increment: 1 }` fixes the *count* but not the decision — the guesses
 * have already happened. A 4-digit PIN falls to one wide enough burst.
 *
 * So the allowance is claimed first, by an `UPDATE` whose own `WHERE` carries the
 * predicate: `pinFailedCount < MAX_PIN_ATTEMPTS`. Concurrent writers serialise on
 * the row lock and each re-evaluates that predicate against the committed value,
 * so at most `MAX_PIN_ATTEMPTS` claims can ever win, however many arrive together.
 * A claim that loses is refused without `verifyPin` being called at all.
 *
 * The comparison itself stays outside every transaction and row lock on purpose:
 * argon2id is deliberately slow, and holding a pooled Supabase connection for the
 * duration would turn this guard into its own denial of service.
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

/**
 * Gives back a single attempt once a cool-off has been served.
 *
 * One, not the full five. Restoring the whole allowance would hand an attacker
 * five guesses per window forever, which is the failure `lockoutMsFor` exists to
 * prevent; leaving it at zero would lock a legitimate parent out permanently,
 * because the slot claim would never match again. One guess per escalating window
 * is the behaviour the doubling was always meant to produce.
 *
 * Conditional on the timestamp it clears, so it fires exactly once no matter how
 * many requests arrive together at the end of a window.
 */
async function restoreOneAttempt(parentId: string, now: Date): Promise<void> {
  await prisma.parent.updateMany({
    where: { id: parentId, pinLockedUntil: { lte: now } },
    data: { pinFailedCount: MAX_PIN_ATTEMPTS - 1, pinLockedUntil: null },
  });
}

/**
 * Consumes one attempt from the current window, returning the count this attempt
 * landed on — or `null` when the window is exhausted or a cool-off is running.
 *
 * The predicate lives in the `WHERE` of the same statement that increments, which
 * is the whole point: see the note on `consumePinAttempt`.
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

/**
 * Starts a cool-off and deepens the escalation by one strike.
 *
 * Conditional on no cool-off already running, so a frustrated parent tapping the
 * pad ten times during a lockout does not buy themselves an hour — the strike is
 * charged once per window, not once per refused tap. Losing that race is the
 * expected outcome under a burst and means another request has already armed the
 * window, so it returns quietly.
 *
 * The two writes are not atomic with each other. That is deliberate and harmless:
 * the *bound* on guesses is held entirely by `claimAttemptSlot`, and the worst a
 * lost race here can do is set a duration one doubling out of step.
 */
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
