import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StudentLayout from "./layout";

describe("StudentLayout", () => {
  it("selects the kid theme for everything it wraps", () => {
    render(
      <StudentLayout>
        <p>lesson</p>
      </StudentLayout>,
    );

    expect(screen.getByText("lesson").closest("[data-theme]")).toHaveAttribute(
      "data-theme",
      "kid",
    );
  });
});
