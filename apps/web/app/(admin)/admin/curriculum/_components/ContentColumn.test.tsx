import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type ColumnItem, ContentColumn } from "./ContentColumn";

const ITEMS: ColumnItem[] = [
  { id: "a", label: "Letters", status: "published" },
  { id: "b", label: "Numbers", status: "draft" },
];

function renderColumn(
  overrides: Partial<Parameters<typeof ContentColumn>[0]> = {},
) {
  const onSelect = vi.fn();
  render(
    <ContentColumn
      title="Subjects"
      items={ITEMS}
      onSelect={onSelect}
      onCreate={vi.fn()}
      emptyHint="No subjects yet."
      {...overrides}
    />,
  );
  return onSelect;
}

describe("ContentColumn", () => {
  it("selects on click", () => {
    const onSelect = renderColumn({ onReorder: vi.fn() });

    fireEvent.click(screen.getByRole("button", { name: /^Letters/ }));

    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("leaves Enter on a row alone, so the browser still activates it", () => {
    renderColumn({ onReorder: vi.fn() });
    const row = screen.getByRole("button", { name: /^Letters/ });

    // `fireEvent` returns false if a handler called `preventDefault`, which used to eat the row's
    // activation; jsdom doesn't synthesise Enter's click, so the cancelled keydown is the signal.
    const wasDelivered = fireEvent.keyDown(row, {
      key: "Enter",
      code: "Enter",
    });

    expect(wasDelivered).toBe(true);
  });

  it("still lets Enter on the handle start a keyboard drag", () => {
    renderColumn({ onReorder: vi.fn() });
    const handle = screen.getByRole("button", { name: "Reorder Letters" });

    const wasDelivered = fireEvent.keyDown(handle, {
      key: "Enter",
      code: "Enter",
    });

    // Cancelled here, and that is correct — the sensor took the keystroke.
    expect(wasDelivered).toBe(false);
  });

  it("gives every draggable row a named handle of its own", () => {
    renderColumn({ onReorder: vi.fn() });

    expect(
      screen.getByRole("button", { name: "Reorder Letters" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reorder Numbers" }),
    ).toBeInTheDocument();
  });

  it("renders no handle at all when the column cannot be reordered", () => {
    renderColumn();

    expect(screen.queryByRole("button", { name: /^Reorder/ })).toBeNull();
  });

  it("never marks a clickable row aria-disabled", () => {
    renderColumn();

    for (const label of ["Letters", "Numbers"]) {
      const row = screen.getByRole("button", { name: new RegExp(`^${label}`) });
      expect(row).not.toHaveAttribute("aria-disabled", "true");
    }
  });

  it("marks the selected row aria-current", () => {
    renderColumn({ selectedId: "b" });

    expect(screen.getByRole("button", { name: /^Numbers/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("shows the hint instead of a list when there is nothing to show", () => {
    render(
      <ContentColumn
        title="Topics"
        items={[]}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        emptyHint="Pick a subject."
      />,
    );

    expect(screen.getByText("Pick a subject.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
