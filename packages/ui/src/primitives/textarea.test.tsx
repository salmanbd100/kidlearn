import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Textarea, textareaVariants } from "./textarea";

describe("Textarea", () => {
  it("keeps a 44px minimum height by default and 64px at size=kid", () => {
    expect(textareaVariants({})).toContain("min-h-11");
    expect(textareaVariants({ size: "kid" })).toContain("min-h-16");
  });

  it("forwards native props", () => {
    render(<Textarea aria-label="Notes" rows={4} />);

    expect(screen.getByLabelText("Notes")).toHaveAttribute("rows", "4");
  });
});
