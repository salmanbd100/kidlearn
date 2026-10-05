import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Parent } from "@kidlearn/db";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";

const DELETE_TOKEN_TTL_MS = 15 * 60_000;

/** Generous: the cascade is the point of the transaction, not a cost to trim. */
const ERASURE_TRANSACTION_TIMEOUT_MS = 120_000;

const DELETE_TOKEN_BYTES = 32;

export type DeletionRequest = {
  confirmationToken: string;
  expiresAt: Date;
};

/** Issuing a new token silently invalidates the previous one: only one request is ever live. */
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

export async function confirmAccountDeletion(
  parent: Parent,
  confirmationToken: string,
): Promise<void> {
  assertConfirmationTokenValid(parent, confirmationToken);

  await prisma.$transaction(
    async (tx) => {
      // Concurrent confirmations both pass the earlier token check; spending it here, inside the erasure's transaction,
      // lets exactly one through, and the other gets the wrong-token 403 rather than a P2025.
      const claimed = await tx.parent.updateMany({
        where: { id: parent.id, deleteToken: parent.deleteToken },
        data: { deleteToken: null, deleteTokenExpiresAt: null },
      });
      if (claimed.count !== 1) {
        throw ApiError.forbidden(
          "Invalid or expired deletion confirmation token",
        );
      }

      // Deleting children explicitly rather than relying on the Parent cascade keeps the intent legible and the count assertable.
      await tx.childProfile.deleteMany({ where: { parentId: parent.id } });
      await tx.parent.delete({ where: { id: parent.id } });
      // Identity last: it cascades Session and Account, invalidating the caller's cookie on commit.
      await tx.user.delete({ where: { id: parent.userId } });
    },
    // Prisma's 5 s default is too short for the cascade over up to five children; a rolled-back erasure could never succeed.
    { timeout: ERASURE_TRANSACTION_TIMEOUT_MS },
  );
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
