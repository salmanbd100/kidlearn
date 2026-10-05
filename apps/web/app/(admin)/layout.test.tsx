import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminLayout from "./layout";

// `next/font` is a compiler transform; outside the Next build it has no loader.
vi.mock("next/font/google", () => ({
  JetBrains_Mono: () => ({ variable: "font-jetbrains-mono-variable" }),
}));

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

  it("loads the monospace font for the CMS alone, and points the theme at it", () => {
    render(
      <AdminLayout>
        <p>review queue</p>
      </AdminLayout>,
    );

    const scope = screen.getByText("review queue").closest("[data-theme]");
    expect(scope).toHaveClass("font-jetbrains-mono-variable");
    expect(scope).toHaveClass("[--family-mono:var(--font-jetbrains-mono)]");
  });
});
