import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IconControl } from "./IconControl";

describe("IconControl", () => {
  it("is named by its label, not its icon", () => {
    render(
      <IconControl label="Hear it again" onPress={vi.fn()}>
        <svg aria-hidden="true" />
      </IconControl>,
    );

    expect(
      screen.getByRole("button", { name: "Hear it again" }),
    ).toBeInTheDocument();
  });

  it("meets the 64px kid touch-target floor in every tone", () => {
    for (const tone of ["primary", "secondary", "quiet"] as const) {
      const { unmount } = render(
        <IconControl label={tone} tone={tone} onPress={vi.fn()}>
          <svg aria-hidden="true" />
        </IconControl>,
      );
      expect(screen.getByRole("button", { name: tone })).toHaveClass("size-16");
      unmount();
    }
  });

  it("reports a toggle's state, and only a toggle's", () => {
    render(
      <>
        <IconControl label="Turn pages" isPressed onPress={vi.fn()}>
          <svg aria-hidden="true" />
        </IconControl>
        <IconControl label="Home" onPress={vi.fn()}>
          <svg aria-hidden="true" />
        </IconControl>
      </>,
    );

    expect(screen.getByRole("button", { name: "Turn pages" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Home" })).not.toHaveAttribute(
      "aria-pressed",
    );
  });

  it("calls back when pressed", () => {
    const onPress = vi.fn();
    render(
      <IconControl label="Leave" onPress={onPress}>
        <svg aria-hidden="true" />
      </IconControl>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
