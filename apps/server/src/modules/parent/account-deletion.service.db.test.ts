import { describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma.js";
import {
  createChild,
  createCurriculum,
  createParent,
  createSession,
} from "../../shared/testing/factories.js";
import {
  confirmAccountDeletion,
  requestAccountDeletion,
} from "./account-deletion.service.js";

// Right to erasure (FR-AUTH-05, NFR-SAFE-05/06) against Postgres: the cascade
// the stubbed suite reads off `schema.prisma`, and the token that two
// concurrent confirmations race to spend.
describe("account deletion against Postgres", () => {
  async function accountWithData() {
    const parent = await createParent();
    const child = await createChild(parent.id);
    await createSession(parent.userId, { activeChildProfileId: child.id });
    const { lesson } = await createCurriculum();
    await prisma.lessonProgress.create({
      data: { childId: child.id, lessonId: lesson.id },
    });
    await prisma.sessionEvent.create({
      data: { childId: child.id, type: "heartbeat" },
    });
    await prisma.rewardLedger.create({
      data: {
        childId: child.id,
        rewardType: "coin",
        amount: 5,
        sourceType: "lesson_completion",
        sourceId: lesson.id,
      },
    });
    await requestAccountDeletion(parent.id);
    return {
      parent: await prisma.parent.findUniqueOrThrow({
        where: { id: parent.id },
      }),
      lessonId: lesson.id,
    };
  }

  it("erases the parent, their children's data, the identity and its sessions", async () => {
    const other = await createParent();
    const otherChild = await createChild(other.id);
    const { parent, lessonId } = await accountWithData();

    await confirmAccountDeletion(parent, parent.deleteToken ?? "");

    expect(await prisma.parent.count({ where: { id: parent.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: parent.userId } })).toBe(0);
    expect(
      await prisma.session.count({ where: { userId: parent.userId } }),
    ).toBe(0);
    expect(
      await prisma.childProfile.count({ where: { parentId: parent.id } }),
    ).toBe(0);
    expect(await prisma.lessonProgress.count()).toBe(0);
    expect(await prisma.sessionEvent.count()).toBe(0);
    expect(await prisma.rewardLedger.count()).toBe(0);

    // Nobody else's account, and no content.
    expect(
      await prisma.childProfile.count({ where: { id: otherChild.id } }),
    ).toBe(1);
    expect(await prisma.lesson.count({ where: { id: lessonId } })).toBe(1);
  });

  it("lets exactly one of two concurrent confirmations through", async () => {
    const { parent } = await accountWithData();
    const token = parent.deleteToken ?? "";

    const outcomes = await Promise.allSettled([
      confirmAccountDeletion(parent, token),
      confirmAccountDeletion(parent, token),
    ]);

    expect(
      outcomes.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    const [rejected] = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === "rejected",
    );
    expect(rejected.reason).toMatchObject({ statusCode: 403 });
    expect(await prisma.parent.count({ where: { id: parent.id } })).toBe(0);
  });
});
