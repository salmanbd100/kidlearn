import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BadgeFacts,
  badgeRuleTopicSlug,
  evaluateBadgeRule,
} from "./badge-rules.js";
import { logger } from "./logger.js";

/**
 * The rule table, tested where it is pure (`general.md §5` — no database needed,
 * so none is stubbed). What the counts are *derived from* is
 * `services/achievementService.ts`; what they *mean* is here.
 */

function facts(overrides: Partial<BadgeFacts> = {}): BadgeFacts {
  return {
    lessonsInTopic: () => ({ completed: 0, totalPublished: 0 }),
    storiesCompleted: 0,
    streakCurrent: 0,
    correctQuestionsInTopic: () => 0,
    ...overrides,
  };
}

/** Counts for one named topic, zero everywhere else. */
function topic(
  slug: string,
  completed: number,
  totalPublished: number,
): Pick<BadgeFacts, "lessonsInTopic"> {
  return {
    lessonsInTopic: (asked) =>
      asked === slug
        ? { completed, totalPublished }
        : { completed: 0, totalPublished: 0 },
  };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lessons_completed_in_topic", () => {
  const rule = { topicSlug: "alphabet", count: 5 };

  it("is earned once the count is reached", () => {
    expect(
      evaluateBadgeRule(
        "lessons_completed_in_topic",
        rule,
        facts(topic("alphabet", 5, 26)),
      ),
    ).toBe(true);
  });

  it("is not earned one lesson short", () => {
    expect(
      evaluateBadgeRule(
        "lessons_completed_in_topic",
        rule,
        facts(topic("alphabet", 4, 26)),
      ),
    ).toBe(false);
  });

  it("counts only the topic it names", () => {
    expect(
      evaluateBadgeRule(
        "lessons_completed_in_topic",
        rule,
        facts(topic("numbers", 20, 20)),
      ),
    ).toBe(false);
  });

  it('measures "all" against the published lessons, not a hard-coded total', () => {
    // The whole point of `"all"`: publishing the twenty-seventh letter lesson
    // must move the goalposts without anyone re-authoring the badge row.
    const all = { topicSlug: "alphabet", count: "all" };

    expect(
      evaluateBadgeRule(
        "lessons_completed_in_topic",
        all,
        facts(topic("alphabet", 26, 26)),
      ),
    ).toBe(true);
    expect(
      evaluateBadgeRule(
        "lessons_completed_in_topic",
        all,
        facts(topic("alphabet", 26, 27)),
      ),
    ).toBe(false);
  });

  it('never awards "all" for a topic with nothing published in it', () => {
    // Otherwise an empty or wholly-draft topic reads as finished, and every
    // child on the platform is handed the badge for it.
    expect(
      evaluateBadgeRule(
        "lessons_completed_in_topic",
        { topicSlug: "shapes", count: "all" },
        facts(topic("shapes", 0, 0)),
      ),
    ).toBe(false);
  });

  it("warns and stays unearned on a malformed rule", () => {
    expect(
      evaluateBadgeRule(
        "lessons_completed_in_topic",
        { topicSlug: "alphabet" },
        facts(topic("alphabet", 26, 26)),
      ),
    ).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("rejects a count of zero, which would award the badge to everyone", () => {
    expect(
      evaluateBadgeRule(
        "lessons_completed_in_topic",
        { topicSlug: "alphabet", count: 0 },
        facts(),
      ),
    ).toBe(false);
  });
});

describe("stories_completed", () => {
  it("is earned at the count and not before", () => {
    expect(
      evaluateBadgeRule(
        "stories_completed",
        { count: 10 },
        facts({ storiesCompleted: 10 }),
      ),
    ).toBe(true);
    expect(
      evaluateBadgeRule(
        "stories_completed",
        { count: 10 },
        facts({ storiesCompleted: 9 }),
      ),
    ).toBe(false);
  });

  it("evaluates false until story completions exist at all (file 26)", () => {
    expect(evaluateBadgeRule("stories_completed", { count: 1 }, facts())).toBe(
      false,
    );
  });
});

describe("streak_days", () => {
  it("reads the streak as it stands after this completion", () => {
    expect(
      evaluateBadgeRule(
        "streak_days",
        { days: 3 },
        facts({ streakCurrent: 3 }),
      ),
    ).toBe(true);
    expect(
      evaluateBadgeRule(
        "streak_days",
        { days: 7 },
        facts({ streakCurrent: 3 }),
      ),
    ).toBe(false);
  });

  it("stays earned on later days of the same streak", () => {
    // `>=`, not `===`: the badge is granted once by the ledger's unique index,
    // and a rule that only matched the exact day would silently stop being true
    // for a child who was already past it when the badge was published.
    expect(
      evaluateBadgeRule(
        "streak_days",
        { days: 3 },
        facts({ streakCurrent: 11 }),
      ),
    ).toBe(true);
  });
});

describe("quiz_correct_in_topic", () => {
  const correct = (slug: string, count: number) => ({
    correctQuestionsInTopic: (asked: string) => (asked === slug ? count : 0),
  });

  it("is earned at the count and not before", () => {
    expect(
      evaluateBadgeRule(
        "quiz_correct_in_topic",
        { topicSlug: "animals", count: 20 },
        facts(correct("animals", 20)),
      ),
    ).toBe(true);
    expect(
      evaluateBadgeRule(
        "quiz_correct_in_topic",
        { topicSlug: "animals", count: 20 },
        facts(correct("animals", 19)),
      ),
    ).toBe(false);
  });

  it("counts only the topic it names", () => {
    expect(
      evaluateBadgeRule(
        "quiz_correct_in_topic",
        { topicSlug: "animals", count: 1 },
        facts(correct("alphabet", 40)),
      ),
    ).toBe(false);
  });
});

describe("a rule row the engine cannot interpret", () => {
  it("warns and evaluates false on an unknown ruleType", () => {
    // A bad admin row must never break a completion — the child gets their
    // celebration, and the badge is an adult's problem.
    expect(
      evaluateBadgeRule(
        "lessons_completed_on_a_tuesday",
        { count: 1 },
        facts(),
      ),
    ).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns and evaluates false when the rule is not an object at all", () => {
    expect(evaluateBadgeRule("streak_days", null, facts())).toBe(false);
    expect(evaluateBadgeRule("streak_days", "3", facts())).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("rejects an unknown key rather than ignoring it", () => {
    // The schemas are strict, so `{ days: 3, weeks: 2 }` is a rule somebody
    // meant something by and this engine does not understand. Awarding it on
    // the half it recognises would be worse than not awarding it.
    expect(
      evaluateBadgeRule(
        "streak_days",
        { days: 3, weeks: 2 },
        facts({ streakCurrent: 30 }),
      ),
    ).toBe(false);
  });
});

describe("badgeRuleTopicSlug", () => {
  it("names the topic a rule is scoped to", () => {
    expect(badgeRuleTopicSlug({ topicSlug: "animals", count: 20 })).toBe(
      "animals",
    );
  });

  it("is undefined for a rule with no topic", () => {
    expect(badgeRuleTopicSlug({ days: 3 })).toBeUndefined();
    expect(badgeRuleTopicSlug(null)).toBeUndefined();
  });
});
