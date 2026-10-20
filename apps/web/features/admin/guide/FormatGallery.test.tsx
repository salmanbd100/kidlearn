import { A11Y_PREF_CLASSES } from "@kidlearn/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FormatGallery } from "./FormatGallery";

describe("FormatGallery", () => {
  beforeEach(() => {
    document.documentElement.classList.add(A11Y_PREF_CLASSES.reducedMotion);
  });

  afterEach(() => {
    document.documentElement.classList.remove(A11Y_PREF_CLASSES.reducedMotion);
  });

  it("switches from activity types to quiz question formats", async () => {
    render(<FormatGallery />);

    expect(screen.getByText("drag_drop")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Quiz question formats" }),
    );

    expect(await screen.findByText("picture_select")).toBeInTheDocument();
    expect(screen.queryByText("drag_drop")).not.toBeInTheDocument();
  });
});
