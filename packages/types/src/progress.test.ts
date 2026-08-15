import { describe, expect, it } from "vitest";
import {
  LESSON_STEPS,
  LessonStepReportSchema,
  nextLessonStep,
  QuizResponsesSubmitSchema,
  resumeLessonStep,
  SessionEventReportSchema,
} from "./progress.js";

const LESSON_ID = "33333333-3333-4333-8333-333333333333";

describe("LESSON_STEPS", () => {
  it("orders the five steps as the player walks them", () => {
    expect([...LESSON_STEPS]).toEqual([
      "intro",
      "video",
      "activity",
      "quiz",
      "reward",
    ]);
  });
});

describe("nextLessonStep", () => {
  it.each([
    ["intro", "video"],
    ["video", "activity"],
    ["activity", "quiz"],
    ["quiz", "reward"],
  ] as const)("advances %s to %s", (from, to) => {
    expect(nextLessonStep(from)).toBe(to);
  });

  it("has no successor after the reward", () => {
    expect(nextLessonStep("reward")).toBeNull();
  });
});

describe("resumeLessonStep", () => {
  it("starts at the intro when nothing has been finished", () => {
    expect(resumeLessonStep(null)).toBe("intro");
  });

  it.each([
    ["intro", "video"],
    ["video", "activity"],
    ["activity", "quiz"],
    ["quiz", "reward"],
  ] as const)("resumes after a finished %s at %s", (lastCompleted, target) => {
    expect(resumeLessonStep(lastCompleted)).toBe(target);
  });

  it("restarts a finished lesson at the intro rather than on the reward", () => {
    // A replay has to be playable. Opening on `reward` would leave the child on
    // a screen with no way forwards (FR-LSN-06).
    expect(resumeLessonStep("reward")).toBe("intro");
  });
});

describe("LessonStepReportSchema", () => {
  it.each(LESSON_STEPS)("accepts %s as an incomplete step", (step) => {
    expect(
      LessonStepReportSchema.safeParse({ step, completed: false }).success,
    ).toBe(true);
  });

  it("accepts completed: true on the reward step", () => {
    expect(
      LessonStepReportSchema.safeParse({ step: "reward", completed: true })
        .success,
    ).toBe(true);
  });

  it.each([
    "intro",
    "video",
    "activity",
    "quiz",
  ] as const)("rejects completed: true on %s — only the last step finishes a lesson", (step) => {
    const result = LessonStepReportSchema.safeParse({ step, completed: true });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].path).toEqual(["completed"]);
  });

  it("rejects a step outside the five", () => {
    expect(
      LessonStepReportSchema.safeParse({ step: "bonus", completed: false })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown key rather than stripping it", () => {
    expect(
      LessonStepReportSchema.safeParse({
        step: "intro",
        completed: false,
        score: 100,
      }).success,
    ).toBe(false);
  });

  it("requires completed — an absent flag is not a false one", () => {
    expect(LessonStepReportSchema.safeParse({ step: "intro" }).success).toBe(
      false,
    );
  });
});

describe("SessionEventReportSchema", () => {
  const validEvent = {
    type: "step_complete",
    lessonId: LESSON_ID,
    step: "video",
    clientTs: "2026-08-10T09:00:00.000Z",
  };

  it("accepts a step_complete event carrying its step", () => {
    expect(SessionEventReportSchema.safeParse(validEvent).success).toBe(true);
  });

  it("accepts a lesson-level event with no step", () => {
    expect(
      SessionEventReportSchema.safeParse({
        type: "lesson_start",
        lessonId: LESSON_ID,
        clientTs: "2026-08-10T09:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it.each([
    "heartbeat",
    "session_start",
    "story_complete",
  ] as const)("rejects %s — a client may not forge the events time limits are built from", (type) => {
    expect(
      SessionEventReportSchema.safeParse({ ...validEvent, type }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid lessonId", () => {
    expect(
      SessionEventReportSchema.safeParse({
        ...validEvent,
        lessonId: "letter-a",
      }).success,
    ).toBe(false);
  });

  it("rejects a clientTs that is not an ISO timestamp", () => {
    expect(
      SessionEventReportSchema.safeParse({ ...validEvent, clientTs: "now" })
        .success,
    ).toBe(false);
  });

  it("accepts the locale-fallback flag a step reports", () => {
    expect(
      SessionEventReportSchema.safeParse({ ...validEvent, fallback: true })
        .success,
    ).toBe(true);
  });

  it("treats fallback as optional — most steps have nothing to report", () => {
    expect(SessionEventReportSchema.safeParse(validEvent).success).toBe(true);
  });
});

describe("QuizResponsesSubmitSchema", () => {
  const pickOne = {
    questionId: "question_1",
    answer: "apple",
    isCorrect: true,
    attempts: 1,
  };
  const paired = {
    questionId: "question_2",
    answer: {
      pairs: [
        { leftId: "dog", rightId: "woof" },
        { leftId: "cat", rightId: "meow" },
      ],
    },
    isCorrect: false,
    attempts: 3,
  };

  function submit(...responses: unknown[]) {
    return QuizResponsesSubmitSchema.safeParse({ responses });
  }

  it("accepts a chosen option id from a pick-one format", () => {
    expect(submit(pickOne).success).toBe(true);
  });

  it("accepts the pair set a match_pair question ends with", () => {
    expect(submit(paired).success).toBe(true);
  });

  it("accepts both answer shapes in one quiz", () => {
    expect(submit(pickOne, paired).success).toBe(true);
  });

  it("rejects attempts below one — a committed answer was tapped at least once", () => {
    expect(submit({ ...pickOne, attempts: 0 }).success).toBe(false);
  });

  it("rejects a fractional attempt count", () => {
    expect(submit({ ...pickOne, attempts: 1.5 }).success).toBe(false);
  });

  it("rejects more responses than a lesson quiz can hold", () => {
    const many = Array.from({ length: 11 }, (_, index) => ({
      ...pickOne,
      questionId: `question_${index}`,
    }));
    expect(
      QuizResponsesSubmitSchema.safeParse({ responses: many }).success,
    ).toBe(false);
  });

  it("rejects an empty submission — there is nothing to score", () => {
    expect(QuizResponsesSubmitSchema.safeParse({ responses: [] }).success).toBe(
      false,
    );
  });

  it("rejects an empty pair set masquerading as a match answer", () => {
    expect(submit({ ...paired, answer: { pairs: [] } }).success).toBe(false);
  });

  it("rejects the same question answered twice", () => {
    // Scoring counts correct records against the quiz's question count, so a
    // question repeated is a percentage above 100 — and a client that sent one
    // is not describing a sitting the player produced.
    const result = submit(pickOne, { ...pickOne });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([
      "responses",
      1,
      "questionId",
    ]);
  });

  it("accepts two different questions with the same answer", () => {
    expect(
      submit(pickOne, { ...pickOne, questionId: "question_9" }).success,
    ).toBe(true);
  });

  it("rejects an unknown key rather than stripping it", () => {
    // A client inventing `score` here would be claiming a number the server is
    // the only authority on (spec §7).
    expect(submit({ ...pickOne, score: 100 }).success).toBe(false);
  });
});
