import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARENT_ROUTES } from "@/features/parent/parent-redirect";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import ParentError from "./error";
import ParentNotFound from "./not-found";
import MissingParentPage from "./parent/[...missing]/page";

describe("(parent) boundaries", () => {
  beforeEach(() => {
    resetI18nForTests();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers a retry when a parent screen throws", () => {
    const reset = vi.fn();
    render(
      <Providers locale="en">
        <ParentError error={new Error("boom")} reset={reset} />
      </Providers>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/went wrong/i);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("speaks the parent's language", () => {
    render(
      <Providers locale="bn">
        <ParentError error={new Error("boom")} reset={vi.fn()} />
      </Providers>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("কিছু একটা ভুল হয়েছে");
  });

  it("sends an unknown parent URL back to the dashboard, not the kid home", () => {
    render(
      <Providers locale="en">
        <ParentNotFound />
      </Providers>,
    );

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      PARENT_ROUTES.dashboard,
    );
  });

  it("answers an unknown /parent/* URL with this group's 404", () => {
    // `notFound()` throws; the nearest `not-found.tsx` up the tree renders.
    expect(() => MissingParentPage()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});
