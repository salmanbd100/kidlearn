import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "./spinner";

describe("Spinner", () => {
  it("announces its label as a status", () => {
    render(<Spinner label="Loading…" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });

  it("is hidden from assistive technology without a label", () => {
    const { container } = render(<Spinner />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
