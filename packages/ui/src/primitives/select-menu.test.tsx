import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Label } from "./label";
import {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
} from "./select-menu";

function Fruit() {
  const [value, setValue] = useState<string>();
  return (
    <>
      <Label htmlFor="fruit">Fruit</Label>
      <SelectMenu value={value} onValueChange={setValue}>
        <SelectMenuTrigger id="fruit" placeholder="Pick a fruit" />
        <SelectMenuContent>
          <SelectMenuItem value="apple">Apple</SelectMenuItem>
          <SelectMenuItem value="pear">Pear</SelectMenuItem>
        </SelectMenuContent>
      </SelectMenu>
      <output>{value ?? "none"}</output>
    </>
  );
}

describe("SelectMenu", () => {
  it("is named by its label and shows the placeholder until a choice is made", () => {
    render(<Fruit />);

    expect(screen.getByRole("combobox", { name: "Fruit" })).toHaveTextContent(
      "Pick a fruit",
    );
  });

  it("opens from the keyboard and commits the chosen option", () => {
    render(<Fruit />);

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Fruit" }), {
      key: "Enter",
    });
    fireEvent.click(screen.getByRole("option", { name: "Pear" }));

    expect(screen.getByRole("combobox", { name: "Fruit" })).toHaveTextContent(
      "Pear",
    );
    expect(screen.getByRole("status")).toHaveTextContent("pear");
  });
});
