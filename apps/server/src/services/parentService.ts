/**
 * Parent domain logic. No Express types cross this boundary — every function
 * here is callable from a test without an HTTP layer.
 */
import { type Parent, Prisma } from "@kidlearn/db";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

/** better-auth writes this into `account.providerId` for Google sign-ins. */
const GOOGLE_PROVIDER_ID = "google";

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = "P2002";

/** The subset of a better-auth session user this service needs. */
export type AuthenticatedUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
};

/**
 * Shape returned to the client. An allowlist, not an omission: new columns on
 * `Parent` stay invisible to HTTP until someone adds them here deliberately, so
 * `pinHash` and file 10's PIN-lockout counters cannot leak by accident.
 */
export type ParentSummary = {
  id: string;
  email: string;
  hasPin: boolean;
  consentGivenAt: Date | null;
};

/**
 * Resolves the `Parent` row for an authenticated better-auth user, creating it
 * on first sight. This is why kidlearn has no separate sign-up: the Google
 * callback creates the identity, and the first authenticated request creates the
 * domain row (FR-AUTH-02).
 *
 * `googleId` comes from the `account` row better-auth wrote during the OAuth
 * exchange, not from the session — the session carries our own user id, while
 * `account.accountId` is the Google profile id the column is documented to hold.
 * A user with no Google account row is not a parent (an admin signing in with
 * credentials, for instance), so they are refused rather than provisioned.
 */
export async function findOrCreateParentForUser(
  user: AuthenticatedUser,
): Promise<Parent> {
  const existing = await prisma.parent.findUnique({
    where: { userId: user.id },
  });
  if (existing) return existing;

  const googleAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: GOOGLE_PROVIDER_ID },
    select: { accountId: true },
  });
  if (!googleAccount) {
    throw ApiError.forbidden(
      "This account did not sign in with Google and cannot access the parent dashboard",
    );
  }

  try {
    // `upsert` on the unique `userId` compiles to a single INSERT ... ON
    // CONFLICT, so two requests racing on a parent's very first page load
    // cannot produce two rows.
    return await prisma.parent.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        googleId: googleAccount.accountId,
        email: user.email,
        name: user.name ?? undefined,
        avatarUrl: user.image ?? undefined,
      },
    });
  } catch (error) {
    // A conflict here is on `email` or `googleId`, not `userId`: some other
    // Parent row already claims this person's Google identity. Surfacing it as
    // a 409 is honest — silently reusing that row would hand one identity's
    // children to another.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_VIOLATION
    ) {
      throw ApiError.conflict(
        "Another parent account already uses this Google identity",
      );
    }
    throw error;
  }
}

/** Projects a `Parent` down to the fields safe to send over HTTP. */
export function toParentSummary(parent: Parent): ParentSummary {
  return {
    id: parent.id,
    email: parent.email,
    // Never the hash itself — only whether one is set, so the client knows
    // whether to show "set a PIN" or "enter your PIN" (file 10).
    hasPin: parent.pinHash !== null,
    consentGivenAt: parent.consentGivenAt,
  };
}
