import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Label, labelVariants } from "./label";

describe("Label", () => {
  it("is text-sm by default and text-lg at size=kid", () => {
    expect(labelVariants({})).toContain("text-sm");
    expect(labelVariants({ size: "kid" })).toContain("text-lg");
  });

  it("names the control its htmlFor points at", () => {
    render(
      <>
        <Label htmlFor="first-name">First name</Label>
        <input id="first-name" />
      </>,
    );

    expect(screen.getByLabelText("First name")).toBeInTheDocument();
  });
});
