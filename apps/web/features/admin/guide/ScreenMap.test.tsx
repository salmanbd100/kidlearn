import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScreenMap } from "./ScreenMap";

describe("ScreenMap", () => {
  it("names each region by its title alone and explains the chosen one", () => {
    render(<ScreenMap />);

    const worlds = screen.getByRole("button", { name: /^\d+\s*Worlds$/ });
    fireEvent.click(worlds);

    expect(worlds).toHaveAttribute("aria-current", "true");
    expect(screen.getByText(/Worlds have no order/)).toBeInTheDocument();
  });
});
