import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Doodle } from "./Doodle";

describe("Doodle", () => {
  it.each(["underline", "squiggle"] as const)(
    "hides the %s mark from assistive technology",
    (kind) => {
      render(<Doodle kind={kind} />);

      expect(screen.getByTestId(`doodle-${kind}`)).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      expect(screen.queryByRole("img")).toBeNull();
    },
  );
});
