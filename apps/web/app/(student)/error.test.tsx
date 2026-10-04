import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import StudentError from "./error";

describe("StudentError", () => {
  beforeEach(() => {
    resetI18nForTests();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives a child a big button that retries the screen", () => {
    const reset = vi.fn();
    render(
      <Providers locale="en">
        <StudentError error={new Error("boom")} reset={reset} />
      </Providers>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/try that again/i);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
