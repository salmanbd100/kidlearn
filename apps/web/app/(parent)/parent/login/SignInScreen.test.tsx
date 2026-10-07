import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { SignInScreen } = await import("./SignInScreen");

describe("SignInScreen", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  it("offers Google sign-in and no way into the public site", () => {
    render(
      <Providers locale="en">
        <SignInScreen />
      </Providers>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "");
    expect(hrefs).toEqual([expect.stringMatching(/\/api\/auth\/google$/)]);
  });
});
