import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFocusWhenDropped } from "./use-focus-when-dropped";

function Pager({ page, withControl }: { page: number; withControl: boolean }) {
  const ref = useFocusWhenDropped<HTMLHeadingElement>(page);
  return (
    <div>
      <h1 ref={ref} tabIndex={-1}>
        page {page}
      </h1>
      {withControl ? (
        <button key={page} type="button">
          next
        </button>
      ) : null}
      <button type="button">stays</button>
    </div>
  );
}

describe("useFocusWhenDropped", () => {
  it("takes focus on arrival when nothing has it", () => {
    render(<Pager page={1} withControl={false} />);

    expect(screen.getByRole("heading")).toHaveFocus();
  });

  it("takes focus back when the focused control leaves with the change", () => {
    const { rerender } = render(<Pager page={1} withControl />);
    screen.getByRole("button", { name: "next" }).focus();

    // Keyed on the page, so the focused button is a different node afterwards.
    rerender(<Pager page={2} withControl />);

    expect(screen.getByRole("heading")).toHaveFocus();
  });

  it("leaves focus where it is when the control is still on screen", () => {
    const { rerender } = render(<Pager page={1} withControl={false} />);
    const stays = screen.getByRole("button", { name: "stays" });
    stays.focus();

    rerender(<Pager page={2} withControl={false} />);

    expect(stays).toHaveFocus();
  });

  it("does nothing on a re-render that changes nothing", () => {
    const { rerender } = render(<Pager page={1} withControl={false} />);
    // Blurring drops focus to <body>, as an unmount would.
    screen.getByRole("heading").blur();

    rerender(<Pager page={1} withControl={false} />);

    expect(document.body).toHaveFocus();
  });
});
