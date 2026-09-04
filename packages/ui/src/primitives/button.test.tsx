import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, buttonVariants } from "./button";

/**
 * The primitive's geometry is an accessibility contract, not decoration
 * (design.md §7, NFR-A11Y-02), and nothing asserted it until now — `packages/ui`
 * had no test runner, so `turbo run test` skipped the package silently.
 */

describe("Button sizes", () => {
  it("meets the 44px parent minimum at the default size", () => {
    // `h-11` is 44px on the default Tailwind scale — the WCAG target-size floor
    // for the parent dashboard.
    expect(buttonVariants({ size: "default" })).toContain("h-11");
  });

  it("is 64px and pill-shaped at size=kid", () => {
    // `h-16` is 64px, the Student Portal floor for a control a child taps.
    const classes = buttonVariants({ size: "kid" });
    expect(classes).toContain("h-16");
    expect(classes).toContain("min-w-16");
    expect(classes).toContain("rounded-pill");
  });

  it("keeps the icon-only button square at the 44px minimum", () => {
    // `size-11`, not `h-11 w-auto`: an icon button with no label still needs a
    // full-size target in both axes.
    expect(buttonVariants({ size: "icon" })).toContain("size-11");
  });

  it("defaults to the parent size, so a kid surface has to opt in", () => {
    expect(buttonVariants({})).toContain("h-11");
  });
});

describe("Button variants", () => {
  it("uses semantic tokens rather than raw hues", () => {
    // design.md: components never name a brand colour. A variant reaching for
    // `bg-sky` instead of `bg-primary` would not follow the active theme.
    for (const variant of [
      "default",
      "secondary",
      "success",
      "destructive",
    ] as const) {
      expect(buttonVariants({ variant })).toMatch(
        /bg-(primary|secondary|success|destructive)/,
      );
    }
  });

  it("pairs every filled variant with its own foreground token", () => {
    // A filled background without its matching foreground is how a variant ends
    // up with unreadable text in one of the two themes.
    expect(buttonVariants({ variant: "default" })).toContain(
      "text-primary-foreground",
    );
    expect(buttonVariants({ variant: "destructive" })).toContain(
      "text-destructive-foreground",
    );
  });
});

describe("Button behaviour", () => {
  it("renders a real button element by default", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("renders the child element instead when asChild is set", () => {
    // The escape hatch a Link or a motion.button needs — without it a kid button
    // would be a <button> wrapping an <a>, which is invalid and unfocusable.
    render(
      <Button asChild>
        <a href="/parent">Dashboard</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("suppresses the 300ms tap delay, which a child reads as a dead button", () => {
    expect(buttonVariants({})).toContain("[touch-action:manipulation]");
  });

  it("keeps a visible focus ring for keyboard users", () => {
    expect(buttonVariants({})).toContain("focus-visible:ring-2");
  });

  it("lets a caller add classes without dropping the variant's own", () => {
    render(<Button className="w-full">Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass("w-full");
    expect(button).toHaveClass("h-11");
  });
});
