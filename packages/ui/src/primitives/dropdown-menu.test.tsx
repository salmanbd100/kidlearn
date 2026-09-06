import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

// What this primitive owns beyond Radix: an identity row that is not an item.

function renderMenu() {
  const onSelect = vi.fn();
  render(
    <DropdownMenu>
      <DropdownMenuTrigger>Account</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span>Salman Rahman</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSelect}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  return { onSelect };
}

describe("DropdownMenu", () => {
  it("opens from the keyboard, which is the only way in without a pointer", () => {
    renderMenu();

    fireEvent.keyDown(screen.getByRole("button", { name: "Account" }), {
      key: "Enter",
    });

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("keeps the identity row out of the menu's items", () => {
    renderMenu();
    fireEvent.keyDown(screen.getByRole("button", { name: "Account" }), {
      key: "Enter",
    });

    // A name and email are context, not a command: exposing them as a menuitem
    // would put a dead stop in the keyboard walk through the menu.
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(screen.getByText("Salman Rahman")).toBeInTheDocument();
  });

  it("fires the item's handler on selection", () => {
    const { onSelect } = renderMenu();
    fireEvent.keyDown(screen.getByRole("button", { name: "Account" }), {
      key: "Enter",
    });

    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));

    expect(onSelect).toHaveBeenCalled();
  });
});
