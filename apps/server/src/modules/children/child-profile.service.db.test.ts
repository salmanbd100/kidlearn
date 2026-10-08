import { describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma.js";
import {
  createChild,
  createCurriculum,
  createParent,
  createSession,
} from "../../shared/testing/factories.js";
import { deleteChildProfile } from "./child-profile.service.js";

describe("deleteChildProfile against Postgres", () => {
  it("cascades the profile's rows and clears the session acting as it", async () => {
    const parent = await createParent();
    const child = await createChild(parent.id);
    const sibling = await createChild(parent.id, { firstName: "Rafi" });
    const session = await createSession(parent.userId, {
      activeChildProfileId: child.id,
    });
    const { lesson } = await createCurriculum();

    for (const childId of [child.id, sibling.id]) {
      await prisma.lessonProgress.create({
        data: { childId, lessonId: lesson.id, currentStep: "quiz" },
      });
      await prisma.sessionEvent.create({
        data: { childId, type: "heartbeat" },
      });
      await prisma.rewardLedger.create({
        data: {
          childId,
          rewardType: "star",
          amount: 1,
          sourceType: "lesson",
          sourceId: lesson.id,
        },
      });
    }

    await deleteChildProfile(child.id);

    expect(
      await prisma.childProfile.findUnique({ where: { id: child.id } }),
    ).toBeNull();
    for (const rows of [
      prisma.lessonProgress.count({ where: { childId: child.id } }),
      prisma.sessionEvent.count({ where: { childId: child.id } }),
      prisma.rewardLedger.count({ where: { childId: child.id } }),
    ]) {
      expect(await rows).toBe(0);
    }

    const after = await prisma.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(after.activeChildProfileId).toBeNull();

    // The cascade stops at the profile.
    expect(
      await prisma.lessonProgress.count({ where: { childId: sibling.id } }),
    ).toBe(1);
    expect(await prisma.parent.count()).toBe(1);
    expect(await prisma.lesson.count()).toBe(1);
  });
});
