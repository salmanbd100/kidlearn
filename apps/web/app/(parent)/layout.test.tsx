import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ParentLayout from "./layout";

describe("ParentLayout", () => {
  it("selects the parent theme for everything it wraps", () => {
    render(
      <ParentLayout>
        <p>dashboard</p>
      </ParentLayout>,
    );

    expect(
      screen.getByText("dashboard").closest("[data-theme]"),
    ).toHaveAttribute("data-theme", "parent");
  });
});
