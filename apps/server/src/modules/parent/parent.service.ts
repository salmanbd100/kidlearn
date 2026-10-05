import { type Parent, Prisma } from "@kidlearn/db";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";

const GOOGLE_PROVIDER_ID = "google";

const UNIQUE_VIOLATION = "P2002";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
};

/** An allowlist, not an omission: new `Parent` columns stay invisible to HTTP until added here, so no credential-shaped column leaks. */
export type ParentSummary = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  consentGivenAt: Date | null;
};

/** Creates the `Parent` row on first sight, which is why there is no separate sign-up (FR-AUTH-02). */
export async function findOrCreateParentForUser(
  user: AuthenticatedUser,
): Promise<Parent> {
  const existing = await prisma.parent.findUnique({
    where: { userId: user.id },
  });
  if (existing) return existing;

  // A user who is already an admin must not get a parent row, or one session would pass both `requireParent` and `requireAdmin`.
  const adminRow = await prisma.adminUser.findUnique({
    where: { authUserId: user.id },
    select: { id: true },
  });
  if (adminRow) {
    throw ApiError.forbidden(
      "Admin accounts cannot access the parent dashboard",
    );
  }

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
    // `upsert` on the unique `userId` is a single INSERT ... ON CONFLICT, so racing first page loads cannot create two rows.
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
    // Conflict is on `email` or `googleId`: another Parent row claims this Google identity. A 409 is honest;
    // reusing that row would hand one identity's children to another.
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

export function toParentSummary(parent: Parent): ParentSummary {
  return {
    id: parent.id,
    email: parent.email,
    // Rendered by the parent chip and dashboard menu; safe because Google already shows the same person this profile.
    name: parent.name,
    avatarUrl: parent.avatarUrl,
    consentGivenAt: parent.consentGivenAt,
  };
}
