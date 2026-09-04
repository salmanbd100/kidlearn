import type { DashboardData } from "@kidlearn/types";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { DashboardSummary } from "./DashboardSummary";

// The dashboard's rendering, driven by fixtures rather than by a fetch.

const NOW = new Date("2026-08-19T12:00:00.000Z");

function data(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    learningMinutes: { today: 12, week: 95, month: 310 },
    subjects: [
      {
        subjectId: "subject_maths",
        slug: "maths",
        name: { en: "Maths", bn: "গণিত" },
        completed: 8,
        total: 10,
        percent: 80,
      },
      {
        subjectId: "subject_language",
        slug: "language",
        name: { en: "Language", bn: null },
        completed: 9,
        total: 26,
        percent: 35,
      },
    ],
    strongestSubjectId: "subject_maths",
    weakestSubjectId: "subject_language",
    recentActivity: [
      {
        type: "lesson_completed",
        refId: "lesson_a",
        title: { en: "Letter A", bn: "অ" },
        occurredAt: "2026-08-19T11:00:00.000Z",
      },
      {
        type: "story_completed",
        refId: "story_fox",
        title: { en: "The Clever Fox", bn: null },
        occurredAt: "2026-08-18T09:00:00.000Z",
      },
      {
        type: "badge_earned",
        refId: "badge_first",
        title: { en: "First Lesson", bn: null },
        occurredAt: "2026-08-16T09:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

const EMPTY: DashboardData = {
  learningMinutes: { today: 0, week: 0, month: 0 },
  subjects: [
    {
      subjectId: "subject_language",
      slug: "language",
      name: { en: "Language", bn: null },
      completed: 0,
      total: 26,
      percent: 0,
    },
  ],
  strongestSubjectId: null,
  weakestSubjectId: null,
  recentActivity: [],
};

function renderSummary(
  payload: DashboardData = data(),
  locale: "en" | "bn" = "en",
) {
  render(
    <Providers locale={locale}>
      <DashboardSummary data={payload} childName="Ava" now={NOW} />
    </Providers>,
  );
}

beforeEach(() => {
  resetI18nForTests();
});

describe("DashboardSummary — learning time", () => {
  it("shows the three windows", () => {
    renderSummary();

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("This week")).toBeInTheDocument();
    expect(screen.getByText("This month")).toBeInTheDocument();
  });

  it("shows minutes below an hour and hours-and-minutes above one", () => {
    renderSummary();

    expect(screen.getByText("12m")).toBeInTheDocument();
    expect(screen.getByText("1h 35m")).toBeInTheDocument();
    expect(screen.getByText("5h 10m")).toBeInTheDocument();
  });

  it("marks a window with no learning time rather than only showing 0m", () => {
    renderSummary({
      ...data(),
      learningMinutes: { today: 0, week: 95, month: 310 },
    });

    // "0m" alone is accurate and discouraging; the note says the app is working.
    expect(screen.getByText("0m")).toBeInTheDocument();
    expect(screen.getAllByText("Nothing yet")).toHaveLength(1);
  });
});

describe("DashboardSummary — subject progress", () => {
  it("draws one bar per subject at the width the server sent", () => {
    renderSummary();

    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute("aria-valuenow", "80");
    // The bar's own width is the datum — a class cannot express a percentage.
    expect(bars[0].firstElementChild).toHaveStyle({ width: "80%" });
    expect(bars[1].firstElementChild).toHaveStyle({ width: "35%" });
  });

  it("shows the count beside the bar, not only the percentage", () => {
    renderSummary();

    // A rounded percentage cannot be turned back into "9 of 26".
    expect(screen.getByText("9 of 26 · 35%")).toBeInTheDocument();
  });

  it("labels the strongest and weakest subject", () => {
    renderSummary();

    expect(screen.getByText("Strongest")).toBeInTheDocument();
    expect(screen.getByText("Needs practice")).toBeInTheDocument();
  });

  it("shows no highlight chips when the server sent no highlights", () => {
    renderSummary(EMPTY);

    // A brand-new child has no weak area (FR-DASH-03).
    expect(screen.queryByText("Strongest")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs practice")).not.toBeInTheDocument();
  });

  it("renders a zero-percent bar without a NaN anywhere", () => {
    renderSummary(EMPTY);

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("0 of 26 · 0%")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("explains an empty curriculum instead of showing an empty card", () => {
    renderSummary({ ...EMPTY, subjects: [] });

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(
      screen.getByText(/No lessons are ready for this grade yet/),
    ).toBeInTheDocument();
  });
});

describe("DashboardSummary — activity feed", () => {
  it("lists every entry with its localized title", () => {
    renderSummary();

    expect(screen.getByText("Letter A")).toBeInTheDocument();
    expect(screen.getByText("The Clever Fox")).toBeInTheDocument();
    expect(screen.getByText("First Lesson")).toBeInTheDocument();
  });

  it("names what each entry was", () => {
    renderSummary();

    expect(screen.getByText("Lesson finished")).toBeInTheDocument();
    expect(screen.getByText("Story read")).toBeInTheDocument();
    expect(screen.getByText("Badge earned")).toBeInTheDocument();
  });

  it("shows a relative date with the absolute one behind it", () => {
    renderSummary();

    expect(screen.getByText("1 hour ago")).toBeInTheDocument();
    expect(screen.getByText("yesterday")).toBeInTheDocument();

    const [newest] = screen.getAllByText("1 hour ago");
    expect(newest).toHaveAttribute("datetime", "2026-08-19T11:00:00.000Z");
    // A relative date is unverifiable on its own; the tooltip is what lets a
    // parent see which day it was.
    expect(newest).toHaveAttribute("title", expect.stringContaining("2026"));
  });

  it("greets a brand-new child instead of showing an empty list", () => {
    renderSummary(EMPTY);

    expect(
      screen.getByText("No adventures yet — Ava's progress will appear here!"),
    ).toBeInTheDocument();
  });
});

describe("DashboardSummary — Bangla", () => {
  it("renders the Bangla title where the server sent one", () => {
    renderSummary(data(), "bn");

    expect(screen.getByText("গণিত")).toBeInTheDocument();
    expect(screen.getByText("অ")).toBeInTheDocument();
  });

  it("falls back to English for a subject with no Bangla translation", () => {
    renderSummary(data(), "bn");

    // `bn: null` is the contract's way of saying "no Bangla exists" — English is
    // the only guaranteed string, so it is shown rather than a blank.
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByText("The Clever Fox")).toBeInTheDocument();
  });

  it("uses the Bangla copy for the chrome", () => {
    renderSummary(data(), "bn");

    expect(screen.getByText("আজ")).toBeInTheDocument();
    expect(screen.getByText("বিষয়")).toBeInTheDocument();
  });
});
