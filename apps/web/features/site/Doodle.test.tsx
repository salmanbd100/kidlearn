import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Doodle } from "./Doodle";

describe("Doodle", () => {
  it("hides the squiggle from assistive technology", () => {
    render(<Doodle kind="squiggle" />);

    expect(screen.getByTestId("doodle-squiggle")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.queryByRole("img")).toBeNull();
  });
});
