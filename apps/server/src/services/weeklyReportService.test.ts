/**
 * The pure half of the weekly report: rows → metrics, and metrics → a note key.
 *
 * No Prisma stub and no `app.ts` import, deliberately — this file is the reason
 * `computeWeeklyMetrics` takes arrays of plain rows rather than a child id, and the
 * reason `selectNote` takes the metrics rather than reading them back. The database
 * half is covered by `routes/reports.test.ts` and `routes/jobs.test.ts`.
 *
 * Every timestamp below is written in UTC and asserted through `Asia/Dhaka`
 * (UTC+6), which is the only way the timezone rules are actually under test: a
 * fixture written in local time would pass against a UTC implementation too.
 */
import { describe, expect, it } from "vitest";
import { localDayStartUtc } from "../lib/local-date.js";
import {
  assertMondayWeekStart,
  computeWeeklyMetrics,
  lastCompletedWeekStart,
  type NoteFacts,
  QUIZ_STAR_MIN_ACCURACY,
  QUIZ_STAR_MIN_ATTEMPTS,
  renderEnglishNote,
  selectNote,
  weekBounds,
} from "./weeklyReportService.js";

const TZ = "Asia/Dhaka";

/** Monday 17 August 2026, as a `@db.Date` column round-trips it. */
const WEEK_START = new Date("2026-08-17T00:00:00.000Z");

/** The same week as local instants — 18:00 UTC Sunday to 18:00 UTC the next. */
const FROM = localDayStartUtc(TZ, "2026-08-17");
const TO = localDayStartUtc(TZ, "2026-08-24");

type Input = Parameters<typeof computeWeeklyMetrics>[0];

function metricsFor(overrides: Partial<Input> = {}) {
  return computeWeeklyMetrics({
    eventTimestamps: [],
    completedLessons: [],
    storyCompletions: [],
    quizResponses: [],
    badges: [],
    weekStart: FROM,
    weekEnd: TO,
    timeZone: TZ,
    ...overrides,
  });
}

/** `n` heartbeats at the client's 30s cadence, starting at `start`. */
function beatsFrom(start: string, count: number): Date[] {
  const first = new Date(start).getTime();
  return Array.from(
    { length: count },
    (_, index) => new Date(first + index * 30_000),
  );
}

function lesson(at: string, concepts: string[] = []) {
  return { completedAt: new Date(at), conceptsIntroduced: concepts };
}

function answer(questionId: string, isCorrect: boolean, at: string) {
  return { questionId, isCorrect, answeredAt: new Date(at) };
}

describe("computeWeeklyMetrics — an empty week", () => {
  it("reports zeros, empty arrays and a null accuracy", () => {
    const metrics = metricsFor();

    expect(metrics).toMatchObject({
      activeDays: 0,
      learningMinutes: 0,
      newLetters: [],
      newWords: [],
      newNumbers: [],
      lessonsCompleted: 0,
      storiesCompleted: 0,
      // `null`, never 0: zero percent is a real and bad score, and a screen that
      // cannot tell it from "nothing was answered" accuses a child of failing.
      quizAccuracy: null,
      quizFirstAttempts: 0,
      badgesEarned: [],
    });
  });
});

describe("computeWeeklyMetrics — activeDays", () => {
  it("counts local calendar days, not UTC ones", () => {
    // 23:30 and 00:30 *in Dhaka* on consecutive dates. In UTC both fall on 18
    // August, so a UTC implementation reports one day and this reports two.
    const metrics = metricsFor({
      eventTimestamps: [
        new Date("2026-08-18T17:30:00.000Z"), // 18 Aug 23:30 local
        new Date("2026-08-18T18:30:00.000Z"), // 19 Aug 00:30 local
      ],
    });

    expect(metrics.activeDays).toBe(2);
  });

  it("counts a day once however many events it holds", () => {
    expect(
      metricsFor({ eventTimestamps: beatsFrom("2026-08-18T04:00:00Z", 40) }),
    ).toMatchObject({ activeDays: 1 });
  });

  it("ignores events outside the week it was asked about", () => {
    const metrics = metricsFor({
      eventTimestamps: [
        // The Sunday before this week begins, local time.
        new Date("2026-08-16T12:00:00.000Z"),
        new Date("2026-08-18T04:00:00.000Z"),
        // The Monday after it ends.
        new Date("2026-08-24T12:00:00.000Z"),
      ],
    });

    // Filtered here as well as in the query, because a `where` clause is a promise
    // about one caller and this function has more than one.
    expect(metrics.activeDays).toBe(1);
  });

  it("caps at seven, which is what the schema allows", () => {
    const metrics = metricsFor({
      eventTimestamps: Array.from({ length: 7 }, (_, day) =>
        localDayStartUtc(TZ, `2026-08-${17 + day}`),
      ),
    });

    expect(metrics.activeDays).toBe(7);
  });
});

describe("computeWeeklyMetrics — learning minutes", () => {
  it("uses the same density rule the dashboard and the limit use", () => {
    // 21 beats at 30s: 10 minutes end to end plus the 30s tail → 11.
    expect(
      metricsFor({ eventTimestamps: beatsFrom("2026-08-18T04:00:00Z", 21) })
        .learningMinutes,
    ).toBe(11);
  });
});

describe("computeWeeklyMetrics — new concepts", () => {
  it("splits tokens by prefix, sorted", () => {
    const metrics = metricsFor({
      completedLessons: [
        lesson("2026-08-18T04:00:00Z", [
          "word:apple",
          "letter:A",
          "number:7",
          "word:ant",
        ]),
      ],
    });

    expect(metrics.newLetters).toEqual(["A"]);
    expect(metrics.newWords).toEqual(["ant", "apple"]);
    expect(metrics.newNumbers).toEqual(["7"]);
  });

  it("dedupes a token two lessons share", () => {
    const metrics = metricsFor({
      completedLessons: [
        lesson("2026-08-18T04:00:00Z", ["letter:A", "word:apple"]),
        lesson("2026-08-19T04:00:00Z", ["letter:A", "word:alligator"]),
      ],
    });

    // Two lessons about A is one letter learned, and a report claiming two would
    // be counting lessons while calling them letters.
    expect(metrics.newLetters).toEqual(["A"]);
    expect(metrics.newWords).toEqual(["alligator", "apple"]);
    expect(metrics.lessonsCompleted).toBe(2);
  });

  it("ignores a token whose prefix it does not know", () => {
    const metrics = metricsFor({
      completedLessons: [
        lesson("2026-08-18T04:00:00Z", [
          "shape:triangle",
          "letter:B",
          "notoken",
          "letter:",
          ":orphan",
        ]),
      ],
    });

    // `conceptsIntroduced` is admin-authored free text. A typo in a CMS field must
    // not be able to fail a parent's report, so anything unrecognised is dropped.
    expect(metrics.newLetters).toEqual(["B"]);
    expect(metrics.newWords).toEqual([]);
    expect(metrics.newNumbers).toEqual([]);
  });

  it("keeps a colon inside a token's value", () => {
    const metrics = metricsFor({
      completedLessons: [lesson("2026-08-18T04:00:00Z", ["word:a:b"])],
    });

    expect(metrics.newWords).toEqual(["a:b"]);
  });

  it("counts nothing from a lesson finished in another week", () => {
    const metrics = metricsFor({
      completedLessons: [lesson("2026-08-10T04:00:00Z", ["letter:Z"])],
    });

    expect(metrics.lessonsCompleted).toBe(0);
    expect(metrics.newLetters).toEqual([]);
  });
});

describe("computeWeeklyMetrics — first-attempt quiz accuracy", () => {
  it("counts a wrong-then-right question as one incorrect first attempt", () => {
    const metrics = metricsFor({
      quizResponses: [
        answer("q1", true, "2026-08-18T04:00:00Z"),
        answer("q2", true, "2026-08-18T04:01:00Z"),
        answer("q3", false, "2026-08-18T04:02:00Z"),
        // The retry that got q3 right. A quiz here has no fail state, so counting
        // this row too would report 100% for every child who kept tapping.
        answer("q3", true, "2026-08-18T04:03:00Z"),
      ],
    });

    expect(metrics.quizFirstAttempts).toBe(3);
    expect(metrics.quizAccuracy).toBe(67);
  });

  it("takes the earliest answer whatever order the rows arrive in", () => {
    const metrics = metricsFor({
      quizResponses: [
        answer("q1", true, "2026-08-18T04:03:00Z"),
        answer("q1", false, "2026-08-18T04:01:00Z"),
      ],
    });

    // Unsorted input on purpose: a Prisma `orderBy` is a promise about a query.
    expect(metrics.quizAccuracy).toBe(0);
    expect(metrics.quizFirstAttempts).toBe(1);
  });

  it("rounds to a whole percent", () => {
    const metrics = metricsFor({
      quizResponses: [
        answer("q1", true, "2026-08-18T04:00:00Z"),
        answer("q2", true, "2026-08-18T04:01:00Z"),
        answer("q3", false, "2026-08-18T04:02:00Z"),
        answer("q4", false, "2026-08-18T04:03:00Z"),
        answer("q5", false, "2026-08-18T04:04:00Z"),
        answer("q6", false, "2026-08-18T04:05:00Z"),
        answer("q7", false, "2026-08-18T04:06:00Z"),
      ],
    });

    // 2/7 = 28.57…
    expect(metrics.quizAccuracy).toBe(29);
  });

  it("ignores answers from outside the week", () => {
    const metrics = metricsFor({
      quizResponses: [
        answer("q1", false, "2026-08-10T04:00:00Z"),
        answer("q2", true, "2026-08-18T04:00:00Z"),
      ],
    });

    expect(metrics.quizAccuracy).toBe(100);
    expect(metrics.quizFirstAttempts).toBe(1);
  });

  it("takes the first attempt inside the week, not the child's first ever", () => {
    const metrics = metricsFor({
      quizResponses: [
        // Last week the child got it wrong. That belongs to last week's report.
        answer("q1", false, "2026-08-12T04:00:00Z"),
        answer("q1", true, "2026-08-18T04:00:00Z"),
      ],
    });

    expect(metrics.quizAccuracy).toBe(100);
  });
});

describe("computeWeeklyMetrics — stories and badges", () => {
  it("counts stories and names badges earned inside the week", () => {
    const metrics = metricsFor({
      storyCompletions: [
        new Date("2026-08-18T04:00:00Z"),
        new Date("2026-08-19T04:00:00Z"),
        // Last week's — the caller's window is what decides, not the array.
        new Date("2026-08-10T04:00:00Z"),
      ],
      badges: [
        {
          slug: "first-lesson",
          name: "First Lesson",
          earnedAt: new Date("2026-08-18T04:00:00Z"),
        },
        {
          slug: "old-hand",
          name: "Old Hand",
          earnedAt: new Date("2026-08-01T04:00:00Z"),
        },
      ],
    });

    expect(metrics.storiesCompleted).toBe(2);
    expect(metrics.badgesEarned).toEqual([
      { slug: "first-lesson", name: "First Lesson" },
    ]);
  });
});

describe("selectNote — the rule order is the specification", () => {
  function facts(overrides: Partial<NoteFacts> = {}): NoteFacts {
    return {
      activeDays: 0,
      learningMinutes: 0,
      newLetters: [],
      newWords: [],
      newNumbers: [],
      lessonsCompleted: 0,
      storiesCompleted: 0,
      quizAccuracy: null,
      quizFirstAttempts: 0,
      quizFirstAttemptsCorrect: 0,
      badgesEarned: [],
      ...overrides,
    };
  }

  it("calls an empty week quiet, and does not congratulate it", () => {
    expect(selectNote(facts())).toEqual({
      noteKey: "quietWeek",
      noteParams: {},
    });
  });

  it("prefers perfectWeek over quizStar when both apply", () => {
    const note = selectNote(
      facts({
        activeDays: 7,
        quizAccuracy: 95,
        quizFirstAttempts: 20,
        lessonsCompleted: 9,
      }),
    );

    // Turning up all seven days is the harder thing and the one a four-year-old
    // controls, so it is what the parent is told about.
    expect(note.noteKey).toBe("perfectWeek");
    expect(note.noteParams).toEqual({ activeDays: 7 });
  });

  it("prefers quizStar over strongWeek", () => {
    const note = selectNote(
      facts({
        activeDays: 6,
        quizAccuracy: 92,
        quizFirstAttempts: 14,
        lessonsCompleted: 6,
      }),
    );

    expect(note.noteKey).toBe("quizStar");
    expect(note.noteParams).toEqual({ accuracy: 92, questions: 14 });
  });

  it("will not call a tiny sample a quiz star", () => {
    const note = selectNote(
      facts({
        activeDays: 5,
        quizAccuracy: 100,
        quizFirstAttempts: QUIZ_STAR_MIN_ATTEMPTS - 1,
        lessonsCompleted: 3,
      }),
    );

    // 100% of nine questions is a sample, not an assessment. The floor is what
    // keeps the one note that claims understanding from being handed out for two
    // lucky taps.
    expect(note.noteKey).toBe("strongWeek");
  });

  it("takes the accuracy threshold as inclusive", () => {
    const note = selectNote(
      facts({
        activeDays: 3,
        quizAccuracy: QUIZ_STAR_MIN_ACCURACY,
        quizFirstAttempts: QUIZ_STAR_MIN_ATTEMPTS,
      }),
    );

    expect(note.noteKey).toBe("quizStar");
  });

  it("prefers strongWeek over bookworm", () => {
    const note = selectNote(
      facts({ activeDays: 5, storiesCompleted: 6, lessonsCompleted: 2 }),
    );

    expect(note.noteKey).toBe("strongWeek");
    expect(note.noteParams).toEqual({ activeDays: 5 });
  });

  it("prefers bookworm over steadyProgress", () => {
    const note = selectNote(
      facts({ activeDays: 2, storiesCompleted: 5, lessonsCompleted: 1 }),
    );

    expect(note.noteKey).toBe("bookworm");
    expect(note.noteParams).toEqual({ stories: 5 });
  });

  it("falls back to steadyProgress for a single finished lesson", () => {
    const note = selectNote(facts({ activeDays: 1, lessonsCompleted: 1 }));

    expect(note.noteKey).toBe("steadyProgress");
    // `count`, not `lessons`: it is the key i18next selects a plural form with, so
    // a one-lesson week reads "1 lesson finished" rather than "1 lessons".
    expect(note.noteParams).toEqual({ count: 1 });
  });

  it("nudges a week with presence but nothing finished", () => {
    const note = selectNote(facts({ activeDays: 2, learningMinutes: 8 }));

    expect(note.noteKey).toBe("gentleNudge");
    expect(note.noteParams).toEqual({ count: 8 });
  });

  it("is what computeWeeklyMetrics attaches", () => {
    const metrics = metricsFor({
      eventTimestamps: beatsFrom("2026-08-18T04:00:00Z", 4),
      completedLessons: [lesson("2026-08-18T04:00:00Z", ["letter:A"])],
    });

    expect(metrics.noteKey).toBe("steadyProgress");
    expect(metrics.noteParams).toEqual({ count: 1 });
  });
});

describe("renderEnglishNote", () => {
  it("interpolates the note's own params", () => {
    expect(
      renderEnglishNote({ noteKey: "bookworm", noteParams: { stories: 6 } }),
    ).toBe("6 stories finished this week. A proper little bookworm!");
  });

  it("leaves a placeholder alone rather than printing undefined", () => {
    // Only reachable if a rule and its template disagree about a param name — a
    // bug, but one that must not put the word "undefined" in a parent's report.
    expect(
      renderEnglishNote({ noteKey: "bookworm", noteParams: {} }),
    ).toContain("{{stories}}");
  });
});

describe("weekBounds", () => {
  it("resolves both edges as local midnights", () => {
    const { from, to, weekEndInclusive } = weekBounds(WEEK_START, TZ);

    // Dhaka is UTC+6, so a local Monday starts at 18:00 UTC the day before.
    expect(from.toISOString()).toBe("2026-08-16T18:00:00.000Z");
    expect(to.toISOString()).toBe("2026-08-23T18:00:00.000Z");
    // The Sunday, in the same date-only encoding as `weekStart` — the screen
    // renders "17–23 Aug", so it needs the far edge inclusive.
    expect(weekEndInclusive.toISOString()).toBe("2026-08-23T00:00:00.000Z");
  });

  it("spans exactly seven local days", () => {
    const { from, to } = weekBounds(WEEK_START, TZ);
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("assertMondayWeekStart", () => {
  it("accepts a Monday at UTC midnight", () => {
    expect(assertMondayWeekStart(WEEK_START)).toBe("2026-08-17");
  });

  it("rejects any other weekday with a 400", () => {
    expect(() =>
      assertMondayWeekStart(new Date("2026-08-19T00:00:00.000Z")),
    ).toThrowError(expect.objectContaining({ statusCode: 400 }));
  });

  it("rejects an instant that is not midnight", () => {
    // A caller who passed `new Date()` on a Monday would otherwise have it
    // silently floored, and the unique index would merge two different intents.
    expect(() =>
      assertMondayWeekStart(new Date("2026-08-17T09:30:00.000Z")),
    ).toThrowError(expect.objectContaining({ statusCode: 400 }));
  });

  it("rejects an invalid date rather than producing NaN bounds", () => {
    expect(() => assertMondayWeekStart(new Date("nonsense"))).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});

describe("lastCompletedWeekStart", () => {
  it("returns the Monday before the week containing now", () => {
    // Wednesday 19 August 2026, midday in Dhaka.
    expect(
      lastCompletedWeekStart(new Date("2026-08-19T06:00:00.000Z"), TZ)
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-08-10");
  });

  it("does not treat the week in progress as finished", () => {
    // Monday itself: the week that just began is not reportable, so the answer is
    // still the one before it. A report for a week being lived through would be
    // replaced on every read.
    expect(
      lastCompletedWeekStart(new Date("2026-08-17T06:00:00.000Z"), TZ)
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-08-10");
  });

  it("counts Sunday as the end of its week, not the start of the next", () => {
    expect(
      lastCompletedWeekStart(new Date("2026-08-23T06:00:00.000Z"), TZ)
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-08-10");
  });

  it("reads the local date, so a late-evening UTC instant is already tomorrow", () => {
    // 23 Aug 19:00 UTC is 24 Aug 01:00 in Dhaka — a new week locally, so the last
    // completed one has moved on. A UTC implementation answers 10 August here.
    expect(
      lastCompletedWeekStart(new Date("2026-08-23T19:00:00.000Z"), TZ)
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-08-17");
  });

  it("always returns a Monday, which is what generation demands", () => {
    for (let day = 1; day <= 28; day += 1) {
      const now = new Date(
        `2026-08-${String(day).padStart(2, "0")}T06:00:00.000Z`,
      );
      expect(() =>
        assertMondayWeekStart(lastCompletedWeekStart(now, TZ)),
      ).not.toThrow();
    }
  });
});
