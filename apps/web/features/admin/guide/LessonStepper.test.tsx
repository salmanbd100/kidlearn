import { A11Y_PREF_CLASSES } from "@kidlearn/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LessonStepper } from "./LessonStepper";

describe("LessonStepper", () => {
  beforeEach(() => {
    document.documentElement.classList.add(A11Y_PREF_CLASSES.reducedMotion);
  });

  afterEach(() => {
    document.documentElement.classList.remove(A11Y_PREF_CLASSES.reducedMotion);
  });

  it("starts at the world and moves forward and back", async () => {
    render(<LessonStepper />);

    expect(screen.getByText(/Step 1 of 6/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText(/Step 2 of 6/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText(/Step 1 of 6/)).toBeInTheDocument();
  });

  it("jumps to a step from the list and marks it current", async () => {
    render(<LessonStepper />);

    fireEvent.click(
      screen.getByRole("button", { name: /Preview and publish/ }),
    );

    expect(await screen.findByText(/Step 6 of 6/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Preview and publish/ }),
    ).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("moves focus to the step position when Next becomes disabled under it", async () => {
    render(<LessonStepper />);

    fireEvent.click(screen.getByRole("button", { name: /Activity and quiz/ }));
    const next = screen.getByRole("button", { name: "Next" });
    next.focus();
    fireEvent.click(next);

    expect(await screen.findByText(/Step 6 of 6/)).toBe(document.activeElement);
  });
});
