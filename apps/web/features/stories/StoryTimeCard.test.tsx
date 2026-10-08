import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StoryTimeCard } from "./StoryTimeCard";

describe("StoryTimeCard", () => {
  it("is one button named by its label alone, its pictures hidden from a screen reader", () => {
    render(<StoryTimeCard label="Story Time" onPress={() => {}} />);

    expect(
      screen.getByRole("button", { name: "Story Time" }),
    ).toBeInTheDocument();
    for (const icon of screen.getByRole("button").querySelectorAll("svg")) {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("opens the story library when tapped", () => {
    const onPress = vi.fn();
    render(<StoryTimeCard label="Story Time" onPress={onPress} />);

    fireEvent.click(screen.getByRole("button", { name: "Story Time" }));

    expect(onPress).toHaveBeenCalledOnce();
  });
});
