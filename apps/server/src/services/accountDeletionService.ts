/**
 * Account deletion (FR-AUTH-05, NFR-SAFE-05/06) — the right-to-erasure path.
 *
 * Two steps on purpose: a single unguarded `DELETE` is one mis-tap away from
 * destroying a family's history, and the token round-trip is also the seam an
 * email confirmation slots into later without changing the HTTP contract.
 *
 * No Express types cross this boundary — every function here is callable from a
 * test without an HTTP layer.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Parent } from "@kidlearn/db";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

/** How long a deletion confirmation token stays usable. */
const DELETE_TOKEN_TTL_MS = 15 * 60_000;

/** Bytes of entropy in the confirmation token (hex-encoded, so 64 chars). */
const DELETE_TOKEN_BYTES = 32;

export type DeletionRequest = {
  confirmationToken: string;
  expiresAt: Date;
};

/**
 * Step one: mint a single-use confirmation token. Issuing a new one silently
 * invalidates the previous token — there is only ever one live request.
 */
export async function requestAccountDeletion(
  parentId: string,
): Promise<DeletionRequest> {
  const confirmationToken = randomBytes(DELETE_TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + DELETE_TOKEN_TTL_MS);

  await prisma.parent.update({
    where: { id: parentId },
    data: { deleteToken: confirmationToken, deleteTokenExpiresAt: expiresAt },
  });

  return { confirmationToken, expiresAt };
}

/**
 * Step two: verify the token, then erase everything.
 *
 * The delete is synchronous and total — there is no soft-delete, no tombstone,
 * and no retained copy of any child's data. See
 * `document/implementation/notes/compliance-consent-deletion.md`.
 */
export async function confirmAccountDeletion(
  parent: Parent,
  confirmationToken: string,
): Promise<void> {
  assertConfirmationTokenValid(parent, confirmationToken);

  await prisma.$transaction(async (tx) => {
    // Each child row cascades to LessonProgress, QuizResponse, RewardLedger,
    // ChildCharacter, Streak, ScreenTimeSetting, SessionEvent and WeeklyReport
    // (see `onDelete: Cascade` in schema.prisma). Deleting the children first
    // rather than relying solely on the Parent cascade keeps the intent legible
    // and the count assertable.
    await tx.childProfile.deleteMany({ where: { parentId: parent.id } });
    await tx.parent.delete({ where: { id: parent.id } });
    // The better-auth identity last: it cascades Session and Account, which is
    // what makes the caller's own cookie invalid the moment this commits.
    await tx.user.delete({ where: { id: parent.userId } });
  });
}

function assertConfirmationTokenValid(
  parent: Parent,
  confirmationToken: string,
): void {
  // One message for every failure mode: an attacker probing tokens learns
  // nothing about whether a deletion is pending or merely expired.
  const rejected = ApiError.forbidden(
    "Invalid or expired deletion confirmation token",
  );

  if (!parent.deleteToken || !parent.deleteTokenExpiresAt) throw rejected;
  if (parent.deleteTokenExpiresAt.getTime() <= Date.now()) throw rejected;

  const expected = Buffer.from(parent.deleteToken, "utf8");
  const provided = Buffer.from(confirmationToken, "utf8");
  // `timingSafeEqual` throws on a length mismatch, which would itself leak the
  // token length — check it first and fail the same way.
  if (expected.length !== provided.length) throw rejected;
  if (!timingSafeEqual(expected, provided)) throw rejected;
}
