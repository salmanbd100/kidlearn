import type { WeeklyReport, WeeklyReportMetrics } from "@kidlearn/types";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { ReportCard } from "./ReportCard";

/**
 * The card is purely presentational, so each state below *is* a fixture — which is
 * the point of keeping the fetch and the clock in the screen above it.
 */

function metrics(
  overrides: Partial<WeeklyReportMetrics> = {},
): WeeklyReportMetrics {
  return {
    activeDays: 4,
    learningMinutes: 95,
    newLetters: ["A", "B"],
    newWords: ["apple"],
    newNumbers: [],
    lessonsCompleted: 6,
    storiesCompleted: 2,
    quizAccuracy: 80,
    quizFirstAttempts: 10,
    quizFirstAttemptsCorrect: 8,
    badgesEarned: [{ slug: "first-lesson", name: "First Lesson" }],
    noteKey: "steadyProgress",
    noteParams: { count: 6 },
    ...overrides,
  };
}

function report(overrides: Partial<WeeklyReport> = {}): WeeklyReport {
  return {
    weekStart: "2026-08-17T00:00:00.000Z",
    weekEnd: "2026-08-23T00:00:00.000Z",
    metrics: metrics(),
    note: "6 lessons finished this week. Every one of them counts.",
    createdAt: "2026-08-24T02:00:00.000Z",
    ...overrides,
  };
}

function renderCard(value: WeeklyReport, locale: "en" | "bn" = "en") {
  render(
    <Providers locale={locale}>
      <ReportCard report={value} />
    </Providers>,
  );
}

beforeEach(() => {
  resetI18nForTests();
});

describe("ReportCard — the figures", () => {
  it("shows the week as a range with a machine-readable date", () => {
    renderCard(report());

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent(/Aug 17/);
    expect(heading.querySelector("time")).toHaveAttribute(
      "dateTime",
      "2026-08-17",
    );
  });

  it("shows active days out of seven, not a bare count", () => {
    renderCard(report());

    // "4" on its own says nothing about a week; "4 of 7" is the fraction.
    expect(screen.getByText("4 of 7")).toBeInTheDocument();
  });

  it("renders the lesson and story counts", () => {
    renderCard(report());

    // `reports.count` is a bare `{{count}}`, which i18next also reads as a plural
    // selector — asserted rather than assumed, because a missing plural form would
    // render the key instead of the number.
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders minutes as a duration a parent reads", () => {
    renderCard(report());

    // 95 minutes, not "95m" — `formatMinutes` switches at the hour.
    expect(screen.getByText("1h 35m")).toBeInTheDocument();
  });

  it("shows accuracy with the number of questions behind it", () => {
    renderCard(report());

    expect(screen.getByText("80%")).toBeInTheDocument();
    // The denominator is what makes the percentage actionable.
    expect(screen.getByText("8 of 10 right first time")).toBeInTheDocument();
  });

  it("takes the correct count from the server, not from the percentage", () => {
    renderCard(
      report({
        // 50 of 101 rounds to 50%, and 50% of 101 rounds back to 51 — a figure
        // that never happened, printed beside the 101 that did.
        metrics: metrics({
          quizAccuracy: 50,
          quizFirstAttempts: 101,
          quizFirstAttemptsCorrect: 50,
        }),
      }),
    );

    expect(screen.getByText("50 of 101 right first time")).toBeInTheDocument();
  });

  it("says no quizzes rather than 0% for a week with none", () => {
    renderCard(
      report({
        metrics: metrics({
          quizAccuracy: null,
          quizFirstAttempts: 0,
          quizFirstAttemptsCorrect: 0,
        }),
      }),
    );

    // Zero percent is a real and bad score. Rendering it here would accuse a child
    // of getting everything wrong in a week they answered nothing.
    expect(screen.getByText("No quizzes")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });
});

describe("ReportCard — new concepts", () => {
  it("lists the tokens themselves, not just how many", () => {
    renderCard(report());

    // "2 new letters" is a number a parent can do nothing with; "A, B" is
    // something they can ask their child about (FR-DASH-05).
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("apple")).toBeInTheDocument();
    expect(screen.getByText("Letters · 2 new")).toBeInTheDocument();
  });

  it("omits a kind with nothing in it rather than showing zero", () => {
    renderCard(report());

    // `newNumbers` is empty in the fixture. Three "0 new" rows would be a report
    // about what a child did not do.
    expect(screen.queryByText(/^Numbers ·/)).not.toBeInTheDocument();
  });

  it("explains a week of practice with no new ground", () => {
    renderCard(
      report({
        metrics: metrics({ newLetters: [], newWords: [], newNumbers: [] }),
      }),
    );

    expect(
      screen.getByText(/No new letters, words or numbers this week/),
    ).toBeInTheDocument();
  });
});

describe("ReportCard — badges", () => {
  it("renders a chip per badge earned", () => {
    renderCard(
      report({
        metrics: metrics({
          badgesEarned: [
            { slug: "first-lesson", name: "First Lesson" },
            { slug: "bookworm", name: "Bookworm" },
          ],
        }),
      }),
    );

    expect(screen.getByText("First Lesson")).toBeInTheDocument();
    expect(screen.getByText("Bookworm")).toBeInTheDocument();
  });

  it("says so plainly when there were none", () => {
    renderCard(report({ metrics: metrics({ badgesEarned: [] }) }));

    expect(screen.getByText("No new badges this week.")).toBeInTheDocument();
  });
});

describe("ReportCard — the encouraging note", () => {
  it("renders the note from its key and params, not the stored sentence", () => {
    renderCard(
      report({
        metrics: metrics({
          noteKey: "quizStar",
          noteParams: { accuracy: 95, questions: 20 },
        }),
        // Deliberately wrong: if this string appears, the component read the
        // fallback instead of localising the key.
        note: "THE STORED SENTENCE",
      }),
    );

    expect(
      screen.getByText(/95% right first time across 20 questions/),
    ).toBeInTheDocument();
    expect(screen.queryByText("THE STORED SENTENCE")).not.toBeInTheDocument();
  });

  it("renders the note in Bangla for a Bangla-reading parent", () => {
    renderCard(
      report({
        metrics: metrics({
          noteKey: "perfectWeek",
          noteParams: { activeDays: 7 },
        }),
      }),
      "bn",
    );

    const note = screen.getByRole("complementary");
    // The whole reason the server sends a key: the sentence localises. Asserting
    // the absence of English rather than an exact translation, so a copy revision
    // does not fail this.
    expect(note).not.toHaveTextContent(/Turning up/);
    expect(note.textContent ?? "").toMatch(/[ঀ-৿]/);
  });

  it("renders the quiet-week note for a week with no activity", () => {
    renderCard(
      report({
        metrics: metrics({
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
          noteKey: "quietWeek",
          noteParams: {},
        }),
      }),
    );

    expect(screen.getByText(/A quiet week/)).toBeInTheDocument();
    // And nothing on the card congratulates it.
    expect(screen.getByText("0 of 7")).toBeInTheDocument();
  });

  it("leaves no unresolved placeholder on screen", () => {
    renderCard(report());

    const note = screen.getByRole("complementary");
    expect(note.textContent ?? "").not.toContain("{{");
  });
});
