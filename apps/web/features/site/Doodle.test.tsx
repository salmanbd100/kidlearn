import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import { Doodle } from "./Doodle";
import { LifecycleDiagram } from "./diagrams/LifecycleDiagram";
import { MonorepoDiagram } from "./diagrams/MonorepoDiagram";
import { RequestDiagram } from "./diagrams/RequestDiagram";

describe("Doodle", () => {
  it.each([
    "underline",
    "star",
    "squiggle",
  ] as const)("hides the %s mark from assistive technology", (kind) => {
    render(<Doodle kind={kind} />);

    expect(screen.getByTestId(`doodle-${kind}`)).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("engineering diagrams", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it.each([
    ["monorepo", MonorepoDiagram, /^Workspace dependency diagram/],
    ["request", RequestDiagram, /^Request path diagram/],
    ["lifecycle", LifecycleDiagram, /^Publishing lifecycle diagram/],
  ] as const)("exposes the %s diagram as a named image", (_, Diagram, name) => {
    render(
      <Providers locale="en">
        <Diagram />
      </Providers>,
    );

    expect(screen.getByRole("img", { name })).toBeInTheDocument();
  });

  it("translates the diagram's name and labels with the page", () => {
    render(
      <Providers locale="bn">
        <LifecycleDiagram />
      </Providers>,
    );

    expect(
      screen.getByRole("img", { name: /^প্রকাশের ধাপের ডায়াগ্রাম/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("একজন মানুষ অনুমোদন দেন")).toBeInTheDocument();
  });
});
