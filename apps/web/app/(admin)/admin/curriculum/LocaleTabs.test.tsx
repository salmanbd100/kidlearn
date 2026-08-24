import type { Locale } from "@kidlearn/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { LocaleTabs } from "./LocaleTabs";

/**
 * The locale switch, and the two ARIA claims it used to make falsely.
 *
 * It wore `role="tablist"` / `role="tab"` without a `tabpanel`, `aria-controls`,
 * roving `tabindex` or arrow-key navigation — a screen reader was told "tab 1 of
 * 2" and then could not find the panel. They are toggle buttons, and now say so.
 *
 * Both panels stay mounted either way: that is what keeps a half-typed
 * translation alive across a switch, and it is why nothing inside may be
 * `required` (see `ContentForm.test.tsx`).
 */

function Harness() {
  const [active, setActive] = useState<Locale>("en");
  return (
    <LocaleTabs
      active={active}
      onActiveChange={setActive}
      render={(locale) => (
        <label>
          Name ({locale})
          <input defaultValue="" name={`name-${locale}`} />
        </label>
      )}
    />
  );
}

const panelFor = (locale: string) =>
  screen.getByLabelText(`Name (${locale})`).closest("div[hidden], div");

describe("LocaleTabs", () => {
  it("claims no tab roles it does not implement", () => {
    render(<Harness />);

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryAllByRole("tabpanel")).toHaveLength(0);
  });

  it("marks the active locale with aria-pressed", () => {
    render(<Harness />);

    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Bangla" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("switches on click", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Bangla" }));

    expect(screen.getByRole("button", { name: "Bangla" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the inactive panel mounted, so nothing typed is lost", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Name (en)"), {
      target: { value: "Letters" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bangla" }));

    // Still in the DOM, still holding its value — only hidden.
    const english = screen.getByLabelText("Name (en)");
    expect(english).toHaveValue("Letters");
    expect(panelFor("en")).toHaveAttribute("hidden");
    expect(panelFor("bn")).not.toHaveAttribute("hidden");
  });
});
