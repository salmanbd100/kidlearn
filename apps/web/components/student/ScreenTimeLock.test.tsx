import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const { ScreenTimeLock } = await import("./ScreenTimeLock");

function renderLock(props: Parameters<typeof ScreenTimeLock>[0]) {
  render(
    <Providers locale="en">
      <ScreenTimeLock {...props} />
    </Providers>,
  );
}

beforeEach(() => {
  resetI18nForTests();
  router.push.mockReset();
});

describe("ScreenTimeLock", () => {
  it("says the day is over when the limit is reached", () => {
    renderLock({ reason: "TIME_LIMIT_REACHED" });

    expect(
      screen.getByRole("heading", { name: "Time's up for today!" }),
    ).toBeInTheDocument();
    expect(screen.getByText("See you tomorrow 🌙")).toBeInTheDocument();
  });

  it("names the hour to come back at when a window is set", () => {
    renderLock({ reason: "OUTSIDE_WINDOW", windowStart: "08:00" });

    // Formatted for the active language, not printed as stored — "08:00" is a
    // storage format, not something to read to a child.
    expect(
      screen.getByRole("heading", { name: /^See you at .+!$/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("08:00")).not.toBeInTheDocument();
  });

  it("formats the window start in the visitor's locale", () => {
    renderLock({ reason: "OUTSIDE_WINDOW", windowStart: "08:00" });

    const expected = new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(1970, 0, 1, 8, 0));

    expect(
      screen.getByRole("heading", { name: `See you at ${expected}!` }),
    ).toBeInTheDocument();
  });

  /**
   * A `423` can arrive without details — from a proxy, or a code path that did not
   * attach them. The screen still has to say something a child can act on rather
   * than interpolating "undefined" into a sentence.
   */
  it("falls back to a generic line when no window start is available", () => {
    renderLock({ reason: "OUTSIDE_WINDOW", windowStart: null });

    expect(
      screen.getByRole("heading", { name: "Not right now!" }),
    ).toBeInTheDocument();
  });

  it("offers one way out, and it goes to the profile picker", () => {
    renderLock({ reason: "TIME_LIMIT_REACHED" });

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Back to players" }));

    // Not `back()`: back would return to the tile that was just refused.
    expect(router.push).toHaveBeenCalledWith("/select-profile");
  });

  it("never shows a raw error message", () => {
    renderLock({ reason: "TIME_LIMIT_REACHED" });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
