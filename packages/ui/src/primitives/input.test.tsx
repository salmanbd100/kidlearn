import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input, inputVariants } from "./input";

describe("Input", () => {
  it("is 44px tall by default and 64px at size=kid", () => {
    expect(inputVariants({})).toContain("h-11");
    expect(inputVariants({ size: "kid" })).toContain("h-16");
  });

  it("does not leak the size variant onto the element as the intrinsic attribute", () => {
    render(<Input aria-label="Name" size="kid" />);

    expect(screen.getByLabelText("Name")).not.toHaveAttribute("size");
  });

  it("forwards native props and lets a caller's className win a conflict", () => {
    render(<Input aria-label="Name" disabled className="h-20" />);

    const input = screen.getByLabelText("Name");
    expect(input).toBeDisabled();
    expect(input).toHaveClass("h-20");
    expect(input).not.toHaveClass("h-11");
  });
});
