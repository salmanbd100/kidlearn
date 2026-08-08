import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AdminLayout from "./layout";

describe("AdminLayout", () => {
  it("selects the parent theme for everything it wraps", () => {
    render(
      <AdminLayout>
        <p>review queue</p>
      </AdminLayout>,
    );

    expect(
      screen.getByText("review queue").closest("[data-theme]"),
    ).toHaveAttribute("data-theme", "parent");
  });
});
