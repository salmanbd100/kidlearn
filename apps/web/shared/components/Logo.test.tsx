import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LOGO_UNDERLINE_PATHS, LOGO_WORDMARK_PATH, Logo } from "./Logo";

const STATIC_LOGO = readFileSync(
  join(import.meta.dirname, "..", "..", "public", "logo.svg"),
  "utf8",
);

describe("Logo", () => {
  it("is one image named KidLearn, with no text for a translator to reach", () => {
    const { container } = render(<Logo />);

    expect(screen.getByRole("img", { name: "KidLearn" })).toBeInTheDocument();
    expect(container.querySelector("text")).toBeNull();
  });

  it("draws the same artwork as public/logo.svg", () => {
    expect(STATIC_LOGO).toContain(`d="${LOGO_WORDMARK_PATH}"`);
    for (const d of LOGO_UNDERLINE_PATHS) {
      expect(STATIC_LOGO).toContain(`d="${d}"`);
    }
  });
});
