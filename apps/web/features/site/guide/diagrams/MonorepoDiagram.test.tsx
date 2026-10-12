import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import { MonorepoDiagram } from "./MonorepoDiagram";

describe("MonorepoDiagram", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it("exposes the diagram as a named image", () => {
    render(
      <Providers locale="en">
        <MonorepoDiagram />
      </Providers>,
    );

    expect(
      screen.getByRole("img", { name: /^Workspace dependency diagram/ }),
    ).toBeInTheDocument();
  });
});
