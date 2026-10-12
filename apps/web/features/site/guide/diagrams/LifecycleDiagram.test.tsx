import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import { LifecycleDiagram } from "./LifecycleDiagram";

describe("LifecycleDiagram", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it("exposes the diagram as a named image", () => {
    render(
      <Providers locale="en">
        <LifecycleDiagram />
      </Providers>,
    );

    expect(
      screen.getByRole("img", { name: /^Publishing lifecycle diagram/ }),
    ).toBeInTheDocument();
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
