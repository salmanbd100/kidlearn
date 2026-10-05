import type { ChildProfile } from "@kidlearn/db";
import { Prisma } from "@kidlearn/db";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../config/prisma.js";
import {
  createChild,
  createCurriculum,
  createParent,
} from "../../shared/testing/factories.js";
import { grantLessonCompletion } from "./reward.service.js";

// The once-only grant (FR-GAM-01..02) rests on the unique index on
// `(childId, rewardType, sourceType, sourceId)` and a Serializable transaction.
// `progress.routes.test.ts` can only read the index off `schema.prisma`; these
// run the grant against it.

let child: ChildProfile;

beforeEach(async () => {
  const parent = await createParent();
  child = await createChild(parent.id);
});

function ledger() {
  return prisma.rewardLedger.findMany({
    where: { childId: child.id },
    select: {
      rewardType: true,
      sourceType: true,
      sourceId: true,
      amount: true,
    },
    orderBy: [{ rewardType: "asc" }, { sourceType: "asc" }],
  });
}

describe("grantLessonCompletion against Postgres", () => {
  it("pays a replayed lesson nothing the second time", async () => {
    const { lesson } = await createCurriculum();

    const first = await grantLessonCompletion(child, lesson.id);
    const afterFirst = await ledger();
    const second = await grantLessonCompletion(child, lesson.id);

    expect(first.starsEarned).toBeGreaterThan(0);
    expect(second.starsEarned).toBe(0);
    expect(second.coinsEarned).toBe(0);
    expect(await ledger()).toEqual(afterFirst);
  });

  it("pays a double tap once — two grants racing write one set of rows", async () => {
    const { lesson } = await createCurriculum();

    const [a, b] = await Promise.all([
      grantLessonCompletion(child, lesson.id),
      grantLessonCompletion(child, lesson.id),
    ]);

    const rows = await ledger();
    const keys = rows.map(
      (row) => `${row.rewardType}|${row.sourceType}|${row.sourceId}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    // Exactly one side was paid; the other saw the first's rows.
    expect([a.starsEarned, b.starsEarned].filter((n) => n > 0)).toHaveLength(1);
    expect(a.totals).toEqual(b.totals);
  });

  it("grants the day's activity coin once across two lessons", async () => {
    const first = await createCurriculum();
    const second = await createCurriculum();

    await grantLessonCompletion(child, first.lesson.id);
    await grantLessonCompletion(child, second.lesson.id);

    const daily = (await ledger()).filter(
      (row) => row.sourceType === "daily_activity",
    );
    expect(daily).toHaveLength(1);
  });

  it("is backed by the index itself, not only by the service's read", async () => {
    const row = {
      childId: child.id,
      rewardType: "star" as const,
      amount: 1,
      sourceType: "lesson_completion",
      sourceId: "lesson-x",
    };
    await prisma.rewardLedger.create({ data: row });

    const duplicate = await prisma.rewardLedger
      .create({ data: row })
      .catch((error: unknown) => error);

    expect(duplicate).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((duplicate as Prisma.PrismaClientKnownRequestError).code).toBe(
      "P2002",
    );
  });
});
