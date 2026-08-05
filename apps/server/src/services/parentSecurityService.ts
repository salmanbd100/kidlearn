/**
 * Parental PIN and COPPA consent logic (FR-AUTH-03, FR-AUTH-04).
 *
 * No Express types cross this boundary — every function here is callable from a
 * test without an HTTP layer. Raw PINs are arguments only: they are never
 * logged, never returned, and never written anywhere but through `hashPin`.
 */
import type { Parent } from "@kidlearn/db";
import { CONSENT_VERSION } from "../lib/consent.js";
import { ApiError } from "../lib/errors.js";
import { hashPin, verifyPin } from "../lib/pin.js";
import { prisma } from "../lib/prisma.js";

/** How long one successful PIN entry keeps the parent area unlocked. */
export const PIN_GRANT_MS = 15 * 60_000;

/** Consecutive wrong entries before the account cools off. */
const MAX_PIN_ATTEMPTS = 5;

/** Length of that cool-off window. */
const PIN_LOCKOUT_MS = 60_000;

export type PinGrant = { pinVerifiedUntil: Date };

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
      "Too many incorrect attempts — try again in a minute",
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

  const failedCount = parent.pinFailedCount + 1;
  const isLockedOut = failedCount >= MAX_PIN_ATTEMPTS;
  await prisma.parent.update({
    where: { id: parent.id },
    data: {
      // Zero the counter as the lockout starts, so each cool-off is followed by
      // a fresh allowance of attempts rather than a one-strike hair trigger.
      pinFailedCount: isLockedOut ? 0 : failedCount,
      pinLockedUntil: isLockedOut
        ? new Date(Date.now() + PIN_LOCKOUT_MS)
        : null,
    },
  });
  return false;
}
