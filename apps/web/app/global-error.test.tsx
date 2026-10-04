import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import GlobalError from "./global-error";

describe("GlobalError", () => {
  it("renders its own document with a retry, since the root layout is gone", () => {
    const markup = renderToStaticMarkup(
      <GlobalError error={new Error("boom")} reset={vi.fn()} />,
    );

    expect(markup).toContain("<html");
    expect(markup).toContain("Something went wrong.");
    expect(markup).toContain("Try again");
  });
});
