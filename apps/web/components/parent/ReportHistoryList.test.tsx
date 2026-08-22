import type { WeeklyReport } from "@kidlearn/types";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { ReportHistoryList } from "./ReportHistoryList";

/**
 * Which week is showing is a URL, so the assertions are about hrefs — the same
 * behaviour `ChildSwitcher.test.tsx` pins, and worth pinning for the same reason: a
 * list built from buttons and `router.replace` would lose the parent's place on the
 * reload a lapsed PIN grant causes, and no week could be bookmarked.
 */

function report(
  weekStart: string,
  weekEnd: string,
  minutes: number,
  lessonsCompleted = 4,
) {
  return {
    weekStart,
    weekEnd,
    metrics: {
      activeDays: 3,
      learningMinutes: minutes,
      newLetters: [],
      newWords: [],
      newNumbers: [],
      lessonsCompleted,
      storiesCompleted: 1,
      quizAccuracy: null,
      quizFirstAttempts: 0,
      quizFirstAttemptsCorrect: 0,
      badgesEarned: [],
      noteKey: "steadyProgress",
      noteParams: { count: lessonsCompleted },
    },
    note: null,
    createdAt: "2026-08-17T02:00:00.000Z",
  } satisfies WeeklyReport;
}

const EARLIER = report(
  "2026-08-10T00:00:00.000Z",
  "2026-08-16T00:00:00.000Z",
  95,
);
const EARLIEST = report(
  "2026-08-03T00:00:00.000Z",
  "2026-08-09T00:00:00.000Z",
  30,
);
const ONE_LESSON = report(
  "2026-07-27T00:00:00.000Z",
  "2026-08-02T00:00:00.000Z",
  30,
  1,
);

function renderList(reports: WeeklyReport[]) {
  render(
    <Providers locale="en">
      <ReportHistoryList
        reports={reports}
        basePath="/parent/reports"
        childId="child_1"
      />
    </Providers>,
  );
}

beforeEach(() => {
  resetI18nForTests();
});

describe("ReportHistoryList", () => {
  it("links each week with both the child and the week in the query", () => {
    renderList([EARLIER, EARLIEST]);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      "href",
      "/parent/reports?child=child_1&week=2026-08-10T00%3A00%3A00.000Z",
    );
  });

  it("carries the child across, so switching week does not switch child", () => {
    renderList([EARLIER]);

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      expect.stringContaining("child=child_1"),
    );
  });

  it("shows the time and lesson count worth comparing across weeks", () => {
    renderList([EARLIER]);

    expect(screen.getByText("1h 35m · 4 lessons")).toBeInTheDocument();
  });

  it("says lesson, not lessons, for a week with one", () => {
    renderList([ONE_LESSON]);

    // `count` selects i18next's plural form; interpolating the number under any
    // other name rendered "1 lessons".
    expect(screen.getByText("30m · 1 lesson")).toBeInTheDocument();
  });

  it("names each row for a screen reader by the week it opens, once", () => {
    renderList([EARLIER]);

    // The label is on the link, which replaces its contents for the accessible
    // name. On the chevron it appended to them, so the week was read twice.
    // A regex, not a literal: `Intl.formatRange` separates the two dates with a
    // thin space that the accessible-name normaliser leaves alone.
    const link = screen.getByRole("link", {
      name: /^Show the week of Aug 10/,
    });

    // The label replaces the row's contents rather than being appended to them:
    // with it on the chevron the name ran "Aug 10 – 16 1h 35m · 4 lessons Show the
    // week of Aug 10 – 16".
    expect(link).not.toHaveAccessibleName(/lesson/);
  });

  it("explains an empty list instead of rendering a bare heading", () => {
    renderList([]);

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(
      screen.getByText(
        "This is the only week so far. Older ones will be listed here.",
      ),
    ).toBeInTheDocument();
  });
});
