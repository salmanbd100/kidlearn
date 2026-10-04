import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select, selectVariants } from "./select";

describe("Select", () => {
  it("is 44px tall by default and 64px at size=kid", () => {
    expect(selectVariants({})).toContain("h-11");
    expect(selectVariants({ size: "kid" })).toContain("h-16");
  });

  it("keeps the browser's own dropdown arrow, so it does not read as a text field", () => {
    // `appearance-none` with no arrow drawn in its place removed the only cue
    // that this opens a list.
    expect(selectVariants({})).not.toContain("appearance-none");
  });

  it("does not leak the size variant onto the element as the visible-rows attribute", () => {
    render(
      <Select aria-label="Grade" size="kid">
        <option value="a">A</option>
      </Select>,
    );

    expect(screen.getByLabelText("Grade")).not.toHaveAttribute("size");
  });
});
