import { CONTENT_STATUSES } from "@kidlearn/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusChip } from "./StatusChip";

/**
 * The chip answers one question — can a child see this? — so the assertion worth
 * making is that `published` and only `published` reads as live. A sixth status
 * added to the matrix and given the wrong tone here would put a "live" badge on
 * something no child can reach, or worse, hide that something is.
 */

describe("StatusChip", () => {
  it("gives published the live tone, and nothing else", () => {
    for (const status of CONTENT_STATUSES) {
      const { unmount } = render(<StatusChip status={status} />);
      const chip = screen.getByText(/\w/);

      if (status === "published") {
        expect(chip.className).toContain("text-success");
      } else {
        expect(chip.className).not.toContain("text-success");
      }
      unmount();
    }
  });

  it("marks the two states waiting on a person", () => {
    for (const status of ["in_review", "approved"] as const) {
      const { unmount } = render(<StatusChip status={status} />);
      expect(screen.getByText(/\w/).className).toContain("text-warning");
      unmount();
    }
  });

  it("labels in_review as two words", () => {
    render(<StatusChip status="in_review" />);

    expect(screen.getByText("In review")).toBeInTheDocument();
  });

  it("has a label for every status the matrix can hold", () => {
    for (const status of CONTENT_STATUSES) {
      const { unmount } = render(<StatusChip status={status} />);
      expect(screen.getByText(/\w/).textContent?.trim()).not.toBe("");
      unmount();
    }
  });
});
