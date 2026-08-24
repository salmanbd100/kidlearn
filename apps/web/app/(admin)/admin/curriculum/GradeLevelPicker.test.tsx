import type { GradeLevelValue } from "@kidlearn/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { GradeLevelPicker } from "./GradeLevelPicker";

/**
 * One picker, used by the subject, topic and lesson forms.
 *
 * It was three copies of the same fieldset that had already drifted apart in
 * their empty-state wording. These assert the toggle logic once, where the
 * duplicates each asserted it nowhere.
 */

function Harness({ initial = [] }: { initial?: GradeLevelValue[] }) {
  const [value, setValue] = useState<GradeLevelValue[]>(initial);
  return <GradeLevelPicker value={value} onChange={setValue} isBusy={false} />;
}

const grade = (name: string) => screen.getByRole("button", { name });

describe("GradeLevelPicker", () => {
  it("offers every grade, none selected to begin with", () => {
    render(<Harness />);

    for (const name of ["Nursery", "KG-1", "KG-2"]) {
      expect(grade(name)).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("adds a grade on click and removes it on the next", () => {
    render(<Harness />);

    fireEvent.click(grade("KG-1"));
    expect(grade("KG-1")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(grade("KG-1"));
    expect(grade("KG-1")).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the others alone when one is toggled", () => {
    render(<Harness initial={["NURSERY", "KG2"]} />);

    fireEvent.click(grade("KG-1"));

    expect(grade("Nursery")).toHaveAttribute("aria-pressed", "true");
    expect(grade("KG-2")).toHaveAttribute("aria-pressed", "true");
  });

  it("says why an empty selection blocks the save, and links it to the group", () => {
    render(<Harness />);

    const hint = screen.getByText(/Pick at least one/);
    expect(screen.getByRole("group")).toHaveAttribute(
      "aria-describedby",
      hint.id,
    );
  });

  it("swaps the warning for the explanation once something is picked", () => {
    render(<Harness initial={["KG1"]} />);

    expect(screen.queryByText(/Pick at least one/)).toBeNull();
    expect(
      screen.getByText("Which learners this appears for."),
    ).toBeInTheDocument();
  });

  it("disables every toggle while a write is in flight", () => {
    render(<GradeLevelPicker value={[]} onChange={vi.fn()} isBusy={true} />);

    for (const name of ["Nursery", "KG-1", "KG-2"]) {
      expect(grade(name)).toBeDisabled();
    }
  });
});
