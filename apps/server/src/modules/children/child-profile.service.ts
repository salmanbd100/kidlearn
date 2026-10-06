// `Prisma` is a value import: the isolation level below is a runtime member.
import { type ChildProfile, Prisma } from "@kidlearn/db";
import { MAX_CHILDREN_PER_PARENT } from "@kidlearn/types";
import { env } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { ApiError } from "../../shared/errors/errors.js";
import { withSerializationRetry } from "../../shared/utils/serializable-retry.js";
import { liveStreakLength } from "../rewards/streak.service.js";
import type { CreateChildBody, UpdateChildBody } from "./children.schema.js";

// Allowlist, not omission: `parentId` must never reach a client (NFR-SAFE-02).
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

// Two queries for the whole set, not two per child. Reads the same ledger as
// `getRewardSummary`, so the two endpoints cannot disagree (FR-GAM-06).
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
      select: { childId: true, current: true, lastActivityDate: true },
    }),
  ]);

  for (const childId of ids) stats.set(childId, { ...NO_STATS });

  for (const row of ledger) {
    const entry = stats.get(row.childId);
    if (entry === undefined) continue;
    // A badge is a row you have, not an amount — same as `readTotals`.
    if (row.rewardType === "star") entry.stars = row._sum.amount ?? 0;
    else if (row.rewardType === "coin") entry.coins = row._sum.amount ?? 0;
    else if (row.rewardType === "badge") entry.badges = row._count._all;
  }

  for (const streak of streaks) {
    const entry = stats.get(streak.childId);
    if (entry !== undefined) {
      entry.currentStreak = liveStreakLength(streak, env.APP_TIMEZONE);
    }
  }

  return stats;
}

// Lets a transaction client and the plain client be interchangeable.
type CharacterReader = {
  character: { findFirst: typeof prisma.character.findFirst };
};

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

      // Named: an inline literal with both `parentId` and `avatarCharacterId`
      // is ambiguous against Prisma's checked/unchecked XOR input.
      const data: Prisma.ChildProfileUncheckedCreateInput = {
        ...input,
        parentId,
      };
      return tx.childProfile.create({ data });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function listChildProfiles(
  parentId: string,
): Promise<ChildProfile[]> {
  return prisma.childProfile.findMany({
    where: { parentId },
    orderBy: { createdAt: "asc" },
  });
}

// Returns `null` so `loadOwnedChild` can answer with the same 404 as a nonexistent id.
export async function findOwnedChildProfile(
  childId: string,
  parentId: string,
): Promise<ChildProfile | null> {
  return prisma.childProfile.findFirst({
    where: { id: childId, parentId },
  });
}

// Ownership is already established by `loadOwnedChild`.
export async function updateChildProfile(
  childId: string,
  input: UpdateChildBody,
): Promise<ChildProfile> {
  if (input.avatarCharacterId !== undefined) {
    // Scoped to this child: another child's unlock does not count.
    await assertAvatarIsSelectable(prisma, input.avatarCharacterId, childId);
  }
  // Named for the same Prisma XOR reason as in `createChildProfileOnce`.
  const data: Prisma.ChildProfileUncheckedUpdateInput = input;
  return prisma.childProfile.update({ where: { id: childId }, data });
}

// One statement, not `$transaction`: a heavy profile overran Prisma's 5s
// interactive-transaction timeout and could never be deleted. The cascade and
// the session's `ON DELETE SET NULL` are atomic in Postgres (FR-PROF-06).
export async function deleteChildProfile(childId: string): Promise<void> {
  await prisma.childProfile.delete({ where: { id: childId } });
}

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
