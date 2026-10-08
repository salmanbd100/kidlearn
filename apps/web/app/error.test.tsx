import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import RootError from "./error";

describe("RootError", () => {
  beforeEach(() => {
    resetI18nForTests();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tells the visitor something went wrong and offers a retry", () => {
    const reset = vi.fn();
    render(
      <Providers locale="en">
        <RootError error={new Error("boom")} reset={reset} />
      </Providers>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /something went wrong/i,
    );
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("speaks the visitor's language", () => {
    render(
      <Providers locale="bn">
        <RootError error={new Error("boom")} reset={vi.fn()} />
      </Providers>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("কিছু একটা ভুল হয়েছে");
  });

  it("leaves a trace of the failure in the console", () => {
    const error = new Error("boom");
    render(
      <Providers locale="en">
        <RootError error={error} reset={vi.fn()} />
      </Providers>,
    );

    expect(console.error).toHaveBeenCalledWith(
      "[kidlearn] route render failed",
      error,
    );
  });
});
