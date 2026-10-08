import type { ChildProfile } from "@kidlearn/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../config/logger.js";
import {
  findNewlyEarnedBadges,
  meetsUnlockCriteria,
  type UnlockTotals,
} from "./achievement.service.js";

/** Character unlock criteria, tested where pure; the Prisma half runs through `progress.routes.test.ts`. */

function totals(overrides: Partial<UnlockTotals> = {}): UnlockTotals {
  return { stars: 0, coins: 0, badges: 0, ...overrides };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("meetsUnlockCriteria", () => {
  it("unlocks on a single criterion once it is met", () => {
    expect(meetsUnlockCriteria({ stars: 10 }, totals({ stars: 10 }))).toBe(
      true,
    );
    expect(meetsUnlockCriteria({ stars: 10 }, totals({ stars: 9 }))).toBe(
      false,
    );
  });

  it("reads each criterion against its own total", () => {
    expect(meetsUnlockCriteria({ coins: 50 }, totals({ stars: 500 }))).toBe(
      false,
    );
    expect(meetsUnlockCriteria({ badges: 2 }, totals({ badges: 3 }))).toBe(
      true,
    );
  });

  it("requires every criterion a multi-key rule names", () => {
    // `{ stars: 10, coins: 50 }` reads as "ten stars *and* fifty coins" to
    // everyone who writes one, so an OR would hand the character out early.
    const rule = { stars: 10, coins: 50 };

    expect(meetsUnlockCriteria(rule, totals({ stars: 10, coins: 50 }))).toBe(
      true,
    );
    expect(meetsUnlockCriteria(rule, totals({ stars: 99, coins: 49 }))).toBe(
      false,
    );
  });

  it("never unlocks on an empty rule", () => {
    // `{}` marks a starter character (no rule); read as criteria it is all-zero conditions met, which would
    // unlock every starter for every child on their first lesson.
    expect(meetsUnlockCriteria({}, totals({ stars: 500 }))).toBe(false);
    // The ordinary case, so not worth warning about.
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns and stays locked on a criterion this engine does not understand", () => {
    // Strict: awarding on the half that parsed would give the character to a
    // child who has not done the thing the admin meant.
    expect(
      meetsUnlockCriteria(
        { stars: 10, lessonsInJungleWorld: 4 },
        totals({ stars: 100 }),
      ),
    ).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns and stays locked when the rule is not an object of numbers", () => {
    expect(meetsUnlockCriteria({ stars: "ten" }, totals({ stars: 99 }))).toBe(
      false,
    );
    expect(meetsUnlockCriteria({ stars: 0 }, totals())).toBe(false);
  });

  it("stays locked, without a warning, when there is no rule at all", () => {
    expect(meetsUnlockCriteria(null, totals({ stars: 500 }))).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("findNewlyEarnedBadges", () => {
  it("counts only lessons this child can see toward a topic badge", async () => {
    const lessonFindMany = vi.fn().mockResolvedValue([]);
    const tx = {
      badge: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "badge-1",
            slug: "topic-master",
            name: "Topic Master",
            ruleType: "lessons_completed_in_topic",
            rule: { topicSlug: "colours", count: "all" },
            iconAsset: null,
          },
        ]),
      },
      rewardLedger: { findMany: vi.fn().mockResolvedValue([]) },
      lesson: { findMany: lessonFindMany },
      lessonProgress: { findMany: vi.fn().mockResolvedValue([]) },
      quizResponse: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const child: ChildProfile = {
      id: "child-1",
      createdAt: new Date(0),
      updatedAt: new Date(0),
      firstName: "Test",
      gradeLevel: "NURSERY",
      parentId: "parent-1",
      preferredLanguage: "en",
      age: 4,
      avatarCharacterId: null,
    };

    await findNewlyEarnedBadges(tx as never, child, 0);

    const where = lessonFindMany.mock.calls[0]?.[0].where;
    expect(where.gradeLevels).toEqual({ has: "NURSERY" });
    expect(where.world).toBeDefined();
    expect(where.topic.is.status).toBe("published");
    expect(where.topic.is.subject).toBeDefined();
    expect(where.topic.is.slug).toEqual({ in: ["colours"] });
  });
});
