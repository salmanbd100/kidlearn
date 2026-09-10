/**
 * Child-profile domain logic (FR-PROF-01..07). No Express types cross this
 * boundary — every function here is callable from a test without an HTTP layer.
 */
// `Prisma` is a value import, not a type-only one: the isolation level below is
// a runtime member of the namespace.
import { type ChildProfile, Prisma } from "@kidlearn/db";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";
import { withSerializationRetry } from "../../shared/utils/serializable-retry.js";
import type { CreateChildBody, UpdateChildBody } from "./children.schema.js";

/** FR-PROF-01 — a household may hold at most five learner profiles. */
export const MAX_CHILDREN_PER_PARENT = 5;

/**
 * The subset of a `ChildProfile` that goes over HTTP. An allowlist, not an
 * omission: `parentId` must never reach a client (NFR-SAFE-02), and any column
 * added to the model later stays invisible until someone lists it here.
 */
export type ChildProfileDto = {
  id: string;
  firstName: string;
  age: number;
  gradeLevel: ChildProfile["gradeLevel"];
  preferredLanguage: ChildProfile["preferredLanguage"];
  avatarCharacterId: string | null;
  createdAt: Date;
  stats: {
    stars: number;
    coins: number;
    badges: number;
    currentStreak: number;
  };
};

/** A profile with nothing earned yet — what a just-created row is worth. */
const NO_STATS: ChildProfileDto["stats"] = {
  stars: 0,
  coins: 0,
  badges: 0,
  currentStreak: 0,
};

export function toChildProfileDto(
  child: ChildProfile,
  stats: ChildProfileDto["stats"] = NO_STATS,
): ChildProfileDto {
  return {
    id: child.id,
    firstName: child.firstName,
    age: child.age,
    gradeLevel: child.gradeLevel,
    preferredLanguage: child.preferredLanguage,
    avatarCharacterId: child.avatarCharacterId,
    createdAt: child.createdAt,
    stats,
  };
}

/**
 * The reward figures for a set of children, in two queries rather than two per
 * child (FR-GAM-06).
 *
 * `stats` used to be hardcoded to zero on every read, which made four published
 * contract fields permanently untrue and gave the student home screen a reward
 * strip that rendered "0 stars" for a frame before `/api/me/rewards/summary`
 * replaced it. The figures come from the same ledger `getRewardSummary` sums, so
 * the two endpoints cannot disagree.
 */
export async function readChildStats(
  childIds: readonly string[],
): Promise<Map<string, ChildProfileDto["stats"]>> {
  const stats = new Map<string, ChildProfileDto["stats"]>();
  if (childIds.length === 0) return stats;

  const ids = [...childIds];
  const [ledger, streaks] = await Promise.all([
    prisma.rewardLedger.groupBy({
      by: ["childId", "rewardType"],
      where: { childId: { in: ids } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.streak.findMany({
      where: { childId: { in: ids } },
      select: { childId: true, current: true },
    }),
  ]);

  for (const childId of ids) stats.set(childId, { ...NO_STATS });

  for (const row of ledger) {
    const entry = stats.get(row.childId);
    if (entry === undefined) continue;
    // A badge is a row you have, not an amount you accumulate — `readTotals` in
    // `reward.service.ts` counts them the same way.
    if (row.rewardType === "star") entry.stars = row._sum.amount ?? 0;
    else if (row.rewardType === "coin") entry.coins = row._sum.amount ?? 0;
    else if (row.rewardType === "badge") entry.badges = row._count._all;
  }

  for (const streak of streaks) {
    const entry = stats.get(streak.childId);
    if (entry !== undefined) entry.currentStreak = streak.current;
  }

  return stats;
}

/** The slice of the Prisma client these functions need, so a transaction
 *  callback and the plain client are interchangeable. */
type CharacterReader = {
  character: { findFirst: typeof prisma.character.findFirst };
};

/** Confirms the requested avatar is one this profile is allowed to wear. */
async function assertAvatarIsSelectable(
  client: CharacterReader,
  avatarCharacterId: string,
  childId?: string,
): Promise<void> {
  const unlockedByThisChild =
    childId === undefined ? [] : [{ unlocks: { some: { childId } } }];

  const avatar = await client.character.findFirst({
    where: {
      id: avatarCharacterId,
      status: "published",
      OR: [{ isDefault: true }, ...unlockedByThisChild],
    },
  });
  if (!avatar) {
    throw new ApiError(400, "VALIDATION_FAILED", "Unknown avatar character", {
      field: "avatarCharacterId",
    });
  }
}

/** Creates a profile, enforcing the five-per-parent cap. */
export async function createChildProfile(
  parentId: string,
  input: CreateChildBody,
): Promise<ChildProfile> {
  return withSerializationRetry(() => createChildProfileOnce(parentId, input));
}

function createChildProfileOnce(
  parentId: string,
  input: CreateChildBody,
): Promise<ChildProfile> {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.childProfile.count({ where: { parentId } });
      if (existing >= MAX_CHILDREN_PER_PARENT) {
        throw ApiError.conflict(
          `Profile limit reached (${MAX_CHILDREN_PER_PARENT})`,
        );
      }

      await assertAvatarIsSelectable(tx, input.avatarCharacterId);

      // Named rather than inlined: Prisma's create input is an XOR of the
      // checked and unchecked shapes, and an inline literal carrying both
      // `parentId` and `avatarCharacterId` is ambiguous to the compiler.
      const data: Prisma.ChildProfileUncheckedCreateInput = {
        ...input,
        parentId,
      };
      return tx.childProfile.create({ data });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** Every profile belonging to one parent, oldest first. */
export async function listChildProfiles(
  parentId: string,
): Promise<ChildProfile[]> {
  return prisma.childProfile.findMany({
    where: { parentId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Loads a profile only if the given parent owns it. Returns `null` rather than
 * throwing so the caller decides the response — `loadOwnedChild` turns it into
 * a 404 that is identical to the one a nonexistent id produces.
 */
export async function findOwnedChildProfile(
  childId: string,
  parentId: string,
): Promise<ChildProfile | null> {
  return prisma.childProfile.findFirst({
    where: { id: childId, parentId },
  });
}

/**
 * Applies a partial update. Ownership is already established by
 * `loadOwnedChild`, so this takes an id rather than re-checking.
 */
export async function updateChildProfile(
  childId: string,
  input: UpdateChildBody,
): Promise<ChildProfile> {
  if (input.avatarCharacterId !== undefined) {
    // Scoped to this child, so an unlocked character is selectable and another
    // child's unlock is not.
    await assertAvatarIsSelectable(prisma, input.avatarCharacterId, childId);
  }
  // See the note in `createChildProfile` about naming the Prisma input type.
  const data: Prisma.ChildProfileUncheckedUpdateInput = input;
  return prisma.childProfile.update({ where: { id: childId }, data });
}

/** Deletes a profile and everything belonging to it (FR-PROF-06). */
export async function deleteChildProfile(childId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: { activeChildProfileId: childId },
      data: { activeChildProfileId: null },
    });
    await tx.childProfile.delete({ where: { id: childId } });
  });
}

/** Points the current session at a child profile (FR-AUTH-06). */
export async function activateChildProfile(
  sessionId: string,
  childId: string,
): Promise<string> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { activeChildProfileId: childId },
  });
  return childId;
}
