import type { ChildProfileResponse } from "@kidlearn/types";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { RewardStrip } from "./RewardStrip";

function stats(
  overrides: Partial<ChildProfileResponse["stats"]> = {},
): ChildProfileResponse["stats"] {
  return { stars: 0, coins: 0, badges: 0, currentStreak: 0, ...overrides };
}

function renderStrip(values: ChildProfileResponse["stats"]) {
  return render(
    <Providers locale="en">
      <RewardStrip stats={values} />
    </Providers>,
  );
}

describe("RewardStrip", () => {
  beforeEach(resetI18nForTests);

  it("shows the counts the server sent", () => {
    renderStrip(stats({ stars: 12, coins: 30, currentStreak: 3 }));

    expect(screen.getByText("12 stars")).toBeInTheDocument();
    expect(screen.getByText("30 coins")).toBeInTheDocument();
    expect(screen.getByText("3 days in a row")).toBeInTheDocument();
  });

  it("keeps the streak chip on screen for a brand-new child", () => {
    renderStrip(stats());

    // Never hidden: a strip that changes shape overnight is one a five-year-old
    // has to re-learn.
    expect(screen.getByText("Start a streak!")).toBeInTheDocument();
    expect(screen.getByText("0 stars")).toBeInTheDocument();
    expect(screen.getByText("0 coins")).toBeInTheDocument();
  });

  it("says a single star and a single day in the singular", () => {
    renderStrip(stats({ stars: 1, coins: 1, currentStreak: 1 }));

    expect(screen.getByText("1 star")).toBeInTheDocument();
    expect(screen.getByText("1 coin")).toBeInTheDocument();
    expect(screen.getByText("1 day in a row")).toBeInTheDocument();
  });

  it("reads the counts in the child's language", () => {
    render(
      <Providers locale="bn">
        <RewardStrip stats={stats({ stars: 5 })} />
      </Providers>,
    );

    expect(screen.getByText("5টি তারা")).toBeInTheDocument();
    expect(screen.getByText("ধারা শুরু করো!")).toBeInTheDocument();
  });
});
