import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import NotFound from "./not-found";

describe("NotFound", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it("says the page is missing and links back home", () => {
    render(
      <Providers locale="en">
        <NotFound />
      </Providers>,
    );

    expect(screen.getByText(/can't find that page/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go home/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
