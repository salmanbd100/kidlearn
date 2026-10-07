import { A11Y_PREF_CLASSES } from "@kidlearn/ui";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Providers } from "@/shared/components/Providers";
import { resetI18nForTests } from "@/shared/lib/i18n";
import type { Locale } from "@/shared/lib/locale";
import { HomeScreen } from "./HomeScreen";

function renderHome(locale: Locale = "en") {
  return render(
    <Providers locale={locale}>
      <HomeScreen />
    </Providers>,
  );
}

describe("HomeScreen", () => {
  beforeEach(() => {
    resetI18nForTests();
  });

  afterEach(() => {
    document.documentElement.classList.remove(A11Y_PREF_CLASSES.reducedMotion);
  });

  it("renders the wordmark and every section heading in English", () => {
    renderHome();

    expect(
      screen.getByRole("heading", { level: 1, name: "KidLearn" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Read the guides" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "What makes it different" }),
    ).toBeInTheDocument();
  });

  it("renders its title in Bangla", () => {
    renderHome("bn");

    expect(
      screen.getByRole("heading", { level: 1, name: "কিডলার্ন" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "শেখা শুরু করো" }),
    ).toBeInTheDocument();
  });

  it("sends a child to the profile picker and a parent to sign-in", () => {
    renderHome();

    expect(
      screen.getByRole("link", { name: "Start learning" }),
    ).toHaveAttribute("href", "/select-profile");
    expect(
      screen.getByRole("link", { name: "Parent sign-in" }),
    ).toHaveAttribute("href", "/parent/login");
  });

  it("puts Start learning first, so it is the first action a child reaches", () => {
    renderHome();

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAccessibleName("Start learning");
  });

  it("links each guide entry to its page", () => {
    renderHome();

    expect(screen.getByRole("link", { name: "For parents" })).toHaveAttribute(
      "href",
      "/guide/parents",
    );
    expect(
      screen.getByRole("link", { name: "For content admins" }),
    ).toHaveAttribute("href", "/guide/admins");
    expect(screen.getByRole("link", { name: "For engineers" })).toHaveAttribute(
      "href",
      "/guide/engineering",
    );
  });

  it("starts the headline below its resting place when motion is allowed", () => {
    renderHome();

    expect(screen.getByTestId("home-headline").style.opacity).toBe("0");
  });

  it("renders the headline settled under reduced motion (NFR-A11Y-05)", () => {
    document.documentElement.classList.add(A11Y_PREF_CLASSES.reducedMotion);
    renderHome();

    const headline = screen.getByTestId("home-headline");
    expect(headline.style.opacity).not.toBe("0");
    expect(headline.style.transform).not.toContain("16px");
  });
});
