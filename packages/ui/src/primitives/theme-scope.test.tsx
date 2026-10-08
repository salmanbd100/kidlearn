import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { ThemeScope } from "./theme-scope";

// Unscoped Radix portals land in `<body>` and wear `:root`'s kid tokens on every surface.

function themeOf(element: Element) {
  return element.closest("[data-theme]")?.getAttribute("data-theme");
}

describe("ThemeScope", () => {
  it("sets the theme on what it wraps", () => {
    render(
      <ThemeScope theme="parent">
        <p>dashboard</p>
      </ThemeScope>,
    );
    expect(themeOf(screen.getByText("dashboard"))).toBe("parent");
  });

  it("keeps a dialog's portal inside the theme", () => {
    render(
      <ThemeScope theme="parent">
        <Dialog open>
          <DialogContent closeLabel="Close">
            <DialogTitle>Delete profile</DialogTitle>
          </DialogContent>
        </Dialog>
      </ThemeScope>,
    );
    expect(themeOf(screen.getByRole("dialog"))).toBe("parent");
  });

  it("keeps a dropdown menu's portal inside the theme", () => {
    render(
      <ThemeScope theme="parent">
        <DropdownMenu open>
          <DropdownMenuTrigger>Account</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ThemeScope>,
    );
    expect(themeOf(screen.getByRole("menu"))).toBe("parent");
  });

  it("resolves a nested scope to the nearest theme", () => {
    render(
      <ThemeScope theme="parent">
        <ThemeScope theme="kid">
          <Dialog open>
            <DialogContent closeLabel="Close">
              <DialogTitle>Leave the lesson?</DialogTitle>
            </DialogContent>
          </Dialog>
        </ThemeScope>
      </ThemeScope>,
    );
    expect(themeOf(screen.getByRole("dialog"))).toBe("kid");
  });
});
