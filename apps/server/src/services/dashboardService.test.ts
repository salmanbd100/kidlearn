/**
 * The dashboard's arithmetic, on in-memory fixtures.
 *
 * No Prisma stub and no database: `computeSubjectProgress` and `mergeActivity`
 * take plain arrays precisely so the rules FR-DASH-03 and FR-DASH-04 state —
 * rounding, the omission of empty subjects, the suppression of the highlight
 * chips, the merge order and the cap — are each one assertion. The queries that
 * feed them are covered in `routes/children.test.ts`.
 */
import { RECENT_ACTIVITY_LIMIT } from "@kidlearn/types";
import { describe, expect, it } from "vitest";
import {
  type BadgeActivityRow,
  computeSubjectProgress,
  type LessonActivityRow,
  mergeActivity,
  type StoryActivityRow,
  type SubjectRef,
  type TopicSubjectLink,
} from "./dashboardService.js";

function subject(overrides: Partial<SubjectRef> = {}): SubjectRef {
  return {
    id: "subject_language",
    slug: "language",
    name: "Language",
    sortOrder: 0,
    translations: [
      { language: "en", name: "Language" },
      { language: "bn", name: "ভাষা" },
    ],
    ...overrides,
  };
}

const LANGUAGE = subject();
const MATHS = subject({
  id: "subject_maths",
  slug: "maths",
  name: "Maths",
  sortOrder: 1,
  translations: [{ language: "en", name: "Maths" }],
});

/** One topic per subject unless a test needs the many-topics case. */
function topics(...refs: SubjectRef[]): TopicSubjectLink[] {
  return refs.map((ref) => ({ topicId: `topic_${ref.slug}`, subject: ref }));
}

describe("computeSubjectProgress", () => {
  it("rounds the percentage of completed lessons", () => {
    const { subjects } = computeSubjectProgress(
      topics(LANGUAGE),
      [{ topicId: "topic_language", total: 26 }],
      Array.from({ length: 9 }, () => "topic_language"),
    );

    // 9/26 is 34.6%, which rounds up.
    expect(subjects).toEqual([
      {
        subjectId: "subject_language",
        slug: "language",
        name: { en: "Language", bn: "ভাষা" },
        completed: 9,
        total: 26,
        percent: 35,
      },
    ]);
  });

  it("sums every topic belonging to the same subject", () => {
    const twoTopics: TopicSubjectLink[] = [
      { topicId: "topic_alphabet", subject: LANGUAGE },
      { topicId: "topic_phonics", subject: LANGUAGE },
    ];

    const { subjects } = computeSubjectProgress(
      twoTopics,
      [
        { topicId: "topic_alphabet", total: 6 },
        { topicId: "topic_phonics", total: 4 },
      ],
      ["topic_alphabet", "topic_alphabet", "topic_phonics"],
    );

    expect(subjects).toHaveLength(1);
    expect(subjects[0]).toMatchObject({ completed: 3, total: 10, percent: 30 });
  });

  it("falls back to the admin label when a locale has no translation row", () => {
    const { subjects } = computeSubjectProgress(
      topics(MATHS),
      [{ topicId: "topic_maths", total: 2 }],
      [],
    );

    // `bn` is null rather than the English string: the client shows English
    // knowingly instead of being handed it under a Bangla key.
    expect(subjects[0].name).toEqual({ en: "Maths", bn: null });
  });

  it("uses the admin label when there are no translations at all", () => {
    const { subjects } = computeSubjectProgress(
      topics(subject({ translations: [] })),
      [{ topicId: "topic_language", total: 2 }],
      [],
    );

    expect(subjects[0].name).toEqual({ en: "Language", bn: null });
  });

  it("omits a subject with no lessons for this grade rather than showing 0%", () => {
    const { subjects } = computeSubjectProgress(
      topics(LANGUAGE, MATHS),
      [{ topicId: "topic_language", total: 4 }],
      ["topic_language"],
    );

    // No `NaN%` and no bar for an empty curriculum, which is not a child's
    // failure to report (FR-DASH-03).
    expect(subjects.map((entry) => entry.slug)).toEqual(["language"]);
  });

  it("ignores completions and totals for a topic outside the visible set", () => {
    const { subjects } = computeSubjectProgress(
      topics(LANGUAGE),
      [
        { topicId: "topic_language", total: 4 },
        { topicId: "topic_draft", total: 99 },
      ],
      ["topic_language", "topic_draft"],
    );

    expect(subjects).toHaveLength(1);
    expect(subjects[0]).toMatchObject({ completed: 1, total: 4 });
  });

  it("orders subjects strongest first", () => {
    const { subjects } = computeSubjectProgress(
      topics(LANGUAGE, MATHS),
      [
        { topicId: "topic_language", total: 4 },
        { topicId: "topic_maths", total: 4 },
      ],
      ["topic_language", "topic_maths", "topic_maths", "topic_maths"],
    );

    expect(subjects.map((entry) => entry.slug)).toEqual(["maths", "language"]);
  });

  it("names the strongest and weakest subject", () => {
    const result = computeSubjectProgress(
      topics(LANGUAGE, MATHS),
      [
        { topicId: "topic_language", total: 4 },
        { topicId: "topic_maths", total: 4 },
      ],
      ["topic_language", "topic_maths", "topic_maths", "topic_maths"],
    );

    expect(result.strongestSubjectId).toBe("subject_maths");
    expect(result.weakestSubjectId).toBe("subject_language");
  });

  it("breaks a tie on the highest percent by the subject's own order", () => {
    const science = subject({
      id: "subject_science",
      slug: "science",
      name: "Science",
      sortOrder: 2,
      translations: [],
    });

    const result = computeSubjectProgress(
      topics(LANGUAGE, MATHS, science),
      [
        { topicId: "topic_language", total: 4 },
        { topicId: "topic_maths", total: 4 },
        { topicId: "topic_science", total: 4 },
      ],
      // Maths and Science both at 50%, Language at 25%.
      [
        "topic_language",
        "topic_maths",
        "topic_maths",
        "topic_science",
        "topic_science",
      ],
    );

    // Maths has the lower `sortOrder`, so it takes the chip.
    expect(result.strongestSubjectId).toBe("subject_maths");
    expect(result.weakestSubjectId).toBe("subject_language");
  });

  it("suppresses both highlights for a brand-new child with every percent at zero", () => {
    const result = computeSubjectProgress(
      topics(LANGUAGE, MATHS),
      [
        { topicId: "topic_language", total: 4 },
        { topicId: "topic_maths", total: 4 },
      ],
      [],
    );

    // A brand-new child has no weak area (FR-DASH-03).
    expect(result.subjects).toHaveLength(2);
    expect(result.strongestSubjectId).toBeNull();
    expect(result.weakestSubjectId).toBeNull();
  });

  it("suppresses both highlights when only one subject has lessons", () => {
    const result = computeSubjectProgress(
      topics(LANGUAGE),
      [{ topicId: "topic_language", total: 4 }],
      ["topic_language"],
    );

    expect(result.strongestSubjectId).toBeNull();
    expect(result.weakestSubjectId).toBeNull();
  });

  it("suppresses both highlights when two subjects sit at the same percent", () => {
    const result = computeSubjectProgress(
      topics(LANGUAGE, MATHS),
      [
        { topicId: "topic_language", total: 4 },
        { topicId: "topic_maths", total: 4 },
      ],
      ["topic_language", "topic_maths"],
    );

    // Both at 25%: calling one "strongest" invents a difference.
    expect(result.strongestSubjectId).toBeNull();
    expect(result.weakestSubjectId).toBeNull();
  });

  it("returns an empty list and no highlights when nothing is published", () => {
    const result = computeSubjectProgress([], [], []);

    expect(result).toEqual({
      subjects: [],
      strongestSubjectId: null,
      weakestSubjectId: null,
    });
  });
});

function lesson(
  at: string,
  overrides: Partial<LessonActivityRow> = {},
): LessonActivityRow {
  return {
    lessonId: "lesson_a",
    completedAt: new Date(at),
    title: "Letter A",
    translations: [
      { language: "en", title: "Letter A" },
      { language: "bn", title: "অ" },
    ],
    ...overrides,
  };
}

function story(
  at: string,
  overrides: Partial<StoryActivityRow> = {},
): StoryActivityRow {
  return {
    storyId: "story_fox",
    completedAt: new Date(at),
    title: "The Clever Fox",
    translations: [{ language: "en", title: "The Clever Fox" }],
    ...overrides,
  };
}

function badge(
  at: string,
  overrides: Partial<BadgeActivityRow> = {},
): BadgeActivityRow {
  return {
    badgeId: "badge_first_lesson",
    earnedAt: new Date(at),
    name: "First Lesson",
    ...overrides,
  };
}

describe("mergeActivity", () => {
  it("interleaves the three types newest first", () => {
    const feed = mergeActivity(
      [lesson("2026-08-18T10:00:00.000Z")],
      [story("2026-08-19T09:00:00.000Z")],
      [badge("2026-08-17T08:00:00.000Z")],
    );

    expect(feed.map((entry) => entry.type)).toEqual([
      "story_completed",
      "lesson_completed",
      "badge_earned",
    ]);
  });

  it("carries the reference of the thing, not of the row that recorded it", () => {
    const feed = mergeActivity([], [], [badge("2026-08-17T08:00:00.000Z")]);

    expect(feed[0]).toEqual({
      type: "badge_earned",
      refId: "badge_first_lesson",
      title: { en: "First Lesson", bn: null },
      occurredAt: "2026-08-17T08:00:00.000Z",
    });
  });

  it("carries both locales of a lesson title", () => {
    const feed = mergeActivity([lesson("2026-08-18T10:00:00.000Z")], [], []);

    expect(feed[0].title).toEqual({ en: "Letter A", bn: "অ" });
  });

  it("orders entries sharing a timestamp deterministically", () => {
    const sameMoment = "2026-08-19T09:00:00.000Z";

    const first = mergeActivity(
      [lesson(sameMoment)],
      [story(sameMoment)],
      [badge(sameMoment)],
    );
    const second = mergeActivity(
      [lesson(sameMoment)],
      [story(sameMoment)],
      [badge(sameMoment)],
    );

    // A feed whose order changed between two reads of the same data would make
    // the newest entry jump around on refresh.
    expect(first.map((entry) => entry.refId)).toEqual(
      second.map((entry) => entry.refId),
    );
    expect(first).toHaveLength(3);
  });

  it("truncates to the newest entries and drops the rest", () => {
    const lessons = Array.from({ length: 30 }, (_, index) =>
      lesson(
        // Index 0 is the newest.
        new Date(Date.UTC(2026, 7, 19, 12) - index * 60_000).toISOString(),
        { lessonId: `lesson_${String(index).padStart(2, "0")}` },
      ),
    );

    const feed = mergeActivity(lessons, [], []);

    expect(feed).toHaveLength(RECENT_ACTIVITY_LIMIT);
    expect(feed[0].refId).toBe("lesson_00");
    expect(feed.at(-1)?.refId).toBe("lesson_19");
  });

  it("returns an empty feed for a child who has done nothing yet", () => {
    expect(mergeActivity([], [], [])).toEqual([]);
  });
});
