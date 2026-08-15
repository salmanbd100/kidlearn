import { describe, expect, it } from "vitest";
import {
  computeLessonGrants,
  type GrantInput,
  REWARD_RULES,
} from "./rewardService.js";

/**
 * The grant table, tested where it is pure (`general.md §5` — no database
 * needed, so none is stubbed). Everything that touches the ledger is covered in
 * `routes/progress.test.ts`, where the idempotency guard is what is interesting.
 */

const LESSON_ID = "33333333-3333-4333-8333-333333333333";
const LOCAL_DATE = "2026-08-15";

function input(overrides: Partial<GrantInput> = {}): GrantInput {
  return {
    lessonId: LESSON_ID,
    quizAttempted: false,
    correctCount: 0,
    firstActivityOfDay: false,
    localDate: LOCAL_DATE,
    ...overrides,
  };
}

describe("computeLessonGrants", () => {
  it("grants two stars for finishing the lesson itself", () => {
    expect(computeLessonGrants(input())).toEqual([
      {
        rewardType: "star",
        amount: 2,
        sourceType: "lesson_completion",
        sourceId: LESSON_ID,
      },
    ]);
  });

  it("adds a star for a quiz that was attempted at all", () => {
    const specs = computeLessonGrants(input({ quizAttempted: true }));

    // Attempted, not passed — a quiz here has no fail state, so this star is
    // for turning up and must not depend on how it went.
    expect(specs).toContainEqual({
      rewardType: "star",
      amount: REWARD_RULES.quizCompletionStars,
      sourceType: "quiz_completion",
      sourceId: LESSON_ID,
    });
  });

  it("grants two coins per correct answer in one row", () => {
    const specs = computeLessonGrants(
      input({ quizAttempted: true, correctCount: 3 }),
    );

    expect(specs).toContainEqual({
      rewardType: "coin",
      amount: 6,
      sourceType: "quiz_correct_answers",
      sourceId: LESSON_ID,
    });
    // One row for the whole quiz, so the grant has a stable id to be unique on.
    expect(
      specs.filter((spec) => spec.sourceType === "quiz_correct_answers"),
    ).toHaveLength(1);
  });

  it("grants no coin row when nothing was answered correctly", () => {
    const specs = computeLessonGrants(
      input({ quizAttempted: true, correctCount: 0 }),
    );

    // A zero-amount row would sit in the ledger claiming a grant happened, and
    // would then block the real one on a later replay through the unique index.
    expect(
      specs.some((spec) => spec.sourceType === "quiz_correct_answers"),
    ).toBe(false);
  });

  it("grants five coins for the first activity of the day, keyed on the local date", () => {
    const specs = computeLessonGrants(input({ firstActivityOfDay: true }));

    expect(specs).toContainEqual({
      rewardType: "coin",
      amount: REWARD_RULES.firstActivityOfDayCoins,
      sourceType: "daily_activity",
      // The date is the idempotency key: "once a day" becomes the same unique
      // constraint as "once a lesson".
      sourceId: LOCAL_DATE,
    });
  });

  it("omits the daily grant on a second lesson the same day", () => {
    const specs = computeLessonGrants(input({ firstActivityOfDay: false }));

    expect(specs.some((spec) => spec.sourceType === "daily_activity")).toBe(
      false,
    );
  });

  it("grants everything at once on a full first run of the day", () => {
    const specs = computeLessonGrants(
      input({ quizAttempted: true, correctCount: 4, firstActivityOfDay: true }),
    );

    const stars = specs
      .filter((spec) => spec.rewardType === "star")
      .reduce((total, spec) => total + spec.amount, 0);
    const coins = specs
      .filter((spec) => spec.rewardType === "coin")
      .reduce((total, spec) => total + spec.amount, 0);

    expect(stars).toBe(3);
    expect(coins).toBe(13);
  });

  it("always sets a sourceId, whatever the input", () => {
    // Postgres treats NULL as distinct in a unique index, so a grant without one
    // would sit outside the idempotency guard and pay out on every replay.
    const specs = computeLessonGrants(
      input({ quizAttempted: true, correctCount: 2, firstActivityOfDay: true }),
    );

    for (const spec of specs) {
      expect(spec.sourceId).not.toBe("");
      expect(typeof spec.sourceId).toBe("string");
    }
  });

  it("produces the identical list for a replay of the same lesson", () => {
    // The unique index is what makes a replay free, and it can only do that if
    // this function is blind to how many times the lesson has been played.
    const first = computeLessonGrants(
      input({ quizAttempted: true, correctCount: 2 }),
    );
    const second = computeLessonGrants(
      input({ quizAttempted: true, correctCount: 2 }),
    );

    expect(second).toEqual(first);
  });
});
