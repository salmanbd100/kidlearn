import type { ChildProfileResponse } from "@kidlearn/types";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { ChildSwitcher } from "./ChildSwitcher";

/**
 * The selection is a URL, so the assertions are about hrefs and `aria-current`.
 *
 * That is the behaviour worth pinning: a switcher built from buttons and
 * `router.replace` would lose the parent's tab on the reload a lapsed PIN grant
 * causes, and could not be deep-linked or navigated back through.
 */

function child(overrides: Partial<ChildProfileResponse> = {}) {
  return {
    id: "child_1",
    firstName: "Ava",
    age: 4,
    gradeLevel: "NURSERY",
    preferredLanguage: "en",
    avatarCharacterId: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    stats: { stars: 0, coins: 0, badges: 0, currentStreak: 0 },
    ...overrides,
  } satisfies ChildProfileResponse;
}

const AVA = child();
const RIAN = child({ id: "child_2", firstName: "Rian" });

function renderSwitcher(
  profiles: ChildProfileResponse[],
  selectedChildId: string,
) {
  render(
    <Providers locale="en">
      <ChildSwitcher profiles={profiles} selectedChildId={selectedChildId} />
    </Providers>,
  );
}

beforeEach(() => {
  resetI18nForTests();
});

describe("ChildSwitcher", () => {
  it("links each child to the dashboard with their id in the query", () => {
    renderSwitcher([AVA, RIAN], AVA.id);

    expect(screen.getByRole("link", { name: /Ava/ })).toHaveAttribute(
      "href",
      "/parent?child=child_1",
    );
    expect(screen.getByRole("link", { name: /Rian/ })).toHaveAttribute(
      "href",
      "/parent?child=child_2",
    );
  });

  it("marks only the selected child as current", () => {
    renderSwitcher([AVA, RIAN], RIAN.id);

    expect(screen.getByRole("link", { name: /Rian/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /Ava/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders nothing for a household with one child", () => {
    renderSwitcher([AVA], AVA.id);

    // A lone tab reads as a control that does nothing, and the name is already
    // in the heading above it.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("escapes an id rather than pasting it into the query raw", () => {
    renderSwitcher([AVA, child({ id: "a b&c", firstName: "Zoe" })], AVA.id);

    expect(screen.getByRole("link", { name: /Zoe/ })).toHaveAttribute(
      "href",
      "/parent?child=a%20b%26c",
    );
  });

  it("gives the nav an accessible name", () => {
    renderSwitcher([AVA, RIAN], AVA.id);

    expect(
      screen.getByRole("navigation", { name: "Choose a child" }),
    ).toBeInTheDocument();
  });
});
