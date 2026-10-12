import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TroubleshootingFinder } from "./TroubleshootingFinder";

describe("TroubleshootingFinder", () => {
  it("filters by an error code", () => {
    render(<TroubleshootingFinder />);

    fireEvent.change(screen.getByLabelText(/Search by what you see/), {
      target: { value: "unregistered_asset" },
    });

    expect(screen.getByText(/^1 of \d+ match$/)).toBeInTheDocument();
    expect(
      screen.getByText("UNREGISTERED_ASSET when publishing"),
    ).toBeInTheDocument();
  });

  it("searches the fix as well as the symptom, ignoring stray spaces", () => {
    render(<TroubleshootingFinder />);

    fireEvent.change(screen.getByLabelText(/Search by what you see/), {
      target: { value: "  language's tab  " },
    });

    expect(screen.getByText(/^1 of \d+ match$/)).toBeInTheDocument();
    expect(
      screen.getByText("“Add the Bangla … before saving”"),
    ).toBeInTheDocument();
  });

  it("says so when nothing matches", () => {
    render(<TroubleshootingFinder />);

    fireEvent.change(screen.getByLabelText(/Search by what you see/), {
      target: { value: "zzzz" },
    });

    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });
});
