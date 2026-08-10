import { LESSON_STEPS, type LessonStep } from "@kidlearn/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/Providers";
import { resetI18nForTests } from "@/lib/i18n";
import { StepContainer } from "./StepContainer";

function renderContainer(step: LessonStep, onExit = vi.fn()) {
  render(
    <Providers locale="en">
      <StepContainer step={step} onExit={onExit}>
        <p>step body</p>
      </StepContainer>
    </Providers>,
  );
  return onExit;
}

/** The five dots, in flow order, as `done` / `current` / `todo`. */
function dotStates(): string[] {
  return LESSON_STEPS.map(
    (step) =>
      document
        .querySelector(`[data-dot="${step}"]`)
        ?.getAttribute("data-state") ?? "missing",
  );
}

describe("StepContainer", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it("always shows five dots, whatever step is on screen", () => {
    renderContainer("activity");

    // Five from the first screen: the shape of the lesson is visible before the
    // child has done any of it.
    expect(document.querySelectorAll("[data-state]")).toHaveLength(5);
  });

  it.each([
    ["intro", ["current", "todo", "todo", "todo", "todo"]],
    ["video", ["done", "current", "todo", "todo", "todo"]],
    ["activity", ["done", "done", "current", "todo", "todo"]],
    ["quiz", ["done", "done", "done", "current", "todo"]],
    ["reward", ["done", "done", "done", "done", "current"]],
  ] as const)("fills the dots up to %s", (step, expected) => {
    renderContainer(step);

    expect(dotStates()).toEqual([...expected]);
  });

  it("reports its position to assistive tech rather than leaving five bare circles", () => {
    renderContainer("quiz");

    const bar = screen.getByRole("progressbar", { name: "Step 4 of 5" });
    expect(bar).toHaveAttribute("aria-valuenow", "4");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
  });

  it("calls onExit when the exit button is tapped", () => {
    const onExit = renderContainer("video");

    fireEvent.click(screen.getByRole("button", { name: "Leave the lesson" }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("renders the step's own content", () => {
    renderContainer("intro");

    expect(screen.getByText("step body")).toBeInTheDocument();
  });

  it("omits the mascot rather than rendering a broken image when the world has none", () => {
    renderContainer("intro");

    expect(screen.queryByRole("presentation")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });

  it("keeps the mascot out of the accessibility tree and out of reach", () => {
    render(
      <Providers locale="en">
        <StepContainer
          step="intro"
          mascotUrl="/images/monkey.png"
          onExit={vi.fn()}
        >
          <p>step body</p>
        </StepContainer>
      </Providers>,
    );

    const mascot = document.querySelector("img");
    expect(mascot).not.toBeNull();
    // Company for the child, never something to tap — and never announced, since
    // the label is what carries the meaning.
    expect(mascot).toHaveAttribute("alt", "");
    expect(mascot).toHaveAttribute("aria-hidden", "true");
    expect(mascot?.className).toContain("pointer-events-none");
  });
});
