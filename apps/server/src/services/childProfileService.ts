/**
 * Child-profile domain logic (FR-PROF-01..07). No Express types cross this
 * boundary — every function here is callable from a test without an HTTP layer.
 */
// `Prisma` is a value import, not a type-only one: the isolation level below is
// a runtime member of the namespace.
import { type ChildProfile, Prisma } from "@kidlearn/db";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { withSerializationRetry } from "../lib/serializable-retry.js";
import type { CreateChildBody, UpdateChildBody } from "../schemas/children.js";

/** FR-PROF-01 — a household may hold at most five learner profiles. */
export const MAX_CHILDREN_PER_PARENT = 5;

/**
 * The subset of a `ChildProfile` that goes over HTTP. An allowlist, not an
 * omission: `parentId` must never reach a client (NFR-SAFE-02), and any column
 * added to the model later stays invisible until someone lists it here.
 *
 * `stats` is a placeholder block so the client can render the profile card in
 * its final shape from day one (FR-PROF-04). Files 23–24 replace the zeros with
 * real ledger and streak queries inside `toChildProfileDto`; nothing else has
 * to change when they do.
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

export function toChildProfileDto(child: ChildProfile): ChildProfileDto {
  return {
    id: child.id,
    firstName: child.firstName,
    age: child.age,
    gradeLevel: child.gradeLevel,
    preferredLanguage: child.preferredLanguage,
    avatarCharacterId: child.avatarCharacterId,
    createdAt: child.createdAt,
    stats: { stars: 0, coins: 0, badges: 0, currentStreak: 0 },
  };
}

/** The slice of the Prisma client these functions need, so a transaction
 *  callback and the plain client are interchangeable. */
type CharacterReader = {
  character: { findFirst: typeof prisma.character.findFirst };
};

/**
 * Confirms the requested avatar is one this profile is allowed to wear.
 *
 * The spec for this file called the flag `isStarter`; the `Character` model
 * (file 06) instead carries `isDefault` — the characters unlocked for everyone
 * from the start — alongside `unlockRule` for the ones earned later (file 24).
 * `status: "published"` is the content-safety guard from `backend.md §4`: a
 * draft or in-review character must never become a child's avatar.
 *
 * `childId` is what makes this reusable on the update path. A creation has no
 * child yet, so only the starters are selectable; an existing profile may also
 * wear anything it has unlocked, which is a `ChildCharacter` row. That table is
 * empty until file 24 grants the first unlock, so the two branches behave
 * identically today — but the *seam* is here, because the alternative is a rule
 * that silently refuses every character a child earns the day rewards ship.
 */
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

/**
 * Creates a profile, enforcing the five-per-parent cap.
 *
 * Sharing one transaction between the count and the insert is not enough on its
 * own: an interactive transaction runs at Postgres's default READ COMMITTED,
 * under which two concurrent creates both count four and both commit, producing
 * exactly the sixth profile the transaction is supposed to prevent. Serializable
 * is what actually makes the cap hold — the loser aborts with P2034 having
 * written nothing, and `withSerializationRetry` re-counts under the winner's row
 * and either succeeds honestly or reports the limit.
 */
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

/**
 * Deletes a profile and everything belonging to it (FR-PROF-06).
 *
 * Only one row is deleted here: every child-data relation (LessonProgress,
 * QuizResponse, RewardLedger, ChildCharacter, Streak, ScreenTimeSetting,
 * SessionEvent, WeeklyReport) declares `onDelete: Cascade`, so Postgres removes
 * the rest. `Session.activeChildProfileId` is the exception — better-auth owns
 * that table and the column is a plain string with no foreign key, so it has to
 * be cleared by hand or the parent's session would keep acting as a profile
 * that no longer exists. `updateMany` rather than a single-session update so
 * the parent's other devices are cleared too.
 */
export async function deleteChildProfile(childId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: { activeChildProfileId: childId },
      data: { activeChildProfileId: null },
    });
    await tx.childProfile.delete({ where: { id: childId } });
  });
}

/**
 * Points the current session at a child profile (FR-AUTH-06).
 *
 * Written straight to the `Session` row rather than through better-auth's own
 * session-update endpoint: `activeChildProfileId` is declared with
 * `input: false` in `lib/auth.ts` precisely so no client can set it, which also
 * rules out better-auth's updater. The column is part of better-auth's session
 * model, so the next `getSession` reads the new value back.
 */
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
