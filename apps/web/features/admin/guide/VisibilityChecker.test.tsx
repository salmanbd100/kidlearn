import { A11Y_PREF_CLASSES } from "@kidlearn/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VisibilityChecker } from "./VisibilityChecker";

describe("VisibilityChecker", () => {
  beforeEach(() => {
    document.documentElement.classList.add(A11Y_PREF_CLASSES.reducedMotion);
  });

  afterEach(() => {
    document.documentElement.classList.remove(A11Y_PREF_CLASSES.reducedMotion);
  });

  it("opens on the unpublished-world mistake and clears once it is fixed", async () => {
    render(<VisibilityChecker />);

    expect(screen.getByText("Hidden from every child.")).toBeInTheDocument();
    expect(screen.getByText(/The world is unpublished/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Its world is published" }),
    );

    expect(
      await screen.findByText("A child in that grade sees this lesson."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/The world is unpublished/),
    ).not.toBeInTheDocument();
  });

  it("names every condition that fails", async () => {
    render(<VisibilityChecker />);

    const grade = screen.getByRole("button", {
      name: "The child's grade is ticked on the lesson, topic and subject",
    });
    fireEvent.click(grade);

    expect(grade).toHaveAttribute("aria-pressed", "false");
    expect(
      await screen.findByText(/The child's grade is missing/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/The world is unpublished/)).toHaveLength(1);
  });
});
