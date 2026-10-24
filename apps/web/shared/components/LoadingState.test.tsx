import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState } from "./LoadingState";

describe("LoadingState", () => {
  it("keeps one status element when the wait turns long, so the new text is announced", () => {
    const { rerender } = render(<LoadingState label="Loading…" />);
    const status = screen.getByRole("status");
    expect(status).toHaveClass("sr-only");

    rerender(<LoadingState label="Waking up the server…" isLabelVisible />);

    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("Waking up the server…");
    expect(status).not.toHaveClass("sr-only");
  });
});
