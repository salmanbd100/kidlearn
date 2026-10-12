import { A11Y_PREF_CLASSES } from "@kidlearn/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContentTreeDiagram } from "./ContentTreeDiagram";

describe("ContentTreeDiagram", () => {
  beforeEach(() => {
    document.documentElement.classList.add(A11Y_PREF_CLASSES.reducedMotion);
  });

  afterEach(() => {
    document.documentElement.classList.remove(A11Y_PREF_CLASSES.reducedMotion);
  });

  it("marks one node current and shows its detail", async () => {
    render(<ContentTreeDiagram />);

    const topic = screen.getByRole("button", { name: /^Topic/ });
    fireEvent.click(topic);

    expect(topic).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /^Lesson/ })).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      await screen.findByText("Groups lessons inside a subject."),
    ).toBeInTheDocument();
  });
});
