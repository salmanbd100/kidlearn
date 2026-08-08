import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import { beforeEach, describe, expect, it } from "vitest";
import { resetI18nForTests } from "@/lib/i18n";
import { LOCALE_COOKIE_NAME } from "@/lib/locale";
import { LanguageSwitch } from "./LanguageSwitch";
import { Providers } from "./Providers";

function Greeting() {
  const { t } = useTranslation();
  return <p data-testid="greeting">{t("actions.letsGo")}</p>;
}

function renderSwitch() {
  return render(
    <Providers locale="en">
      <Greeting />
      <LanguageSwitch />
    </Providers>,
  );
}

describe("LanguageSwitch", () => {
  beforeEach(() => {
    resetI18nForTests();
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom implements document.cookie, not the Cookie Store API — and this is the same interface i18next's detector writes through.
    document.cookie = `${LOCALE_COOKIE_NAME}=; Max-Age=0; path=/`;
    document.documentElement.lang = "en";
  });

  it("swaps the interface to Bangla without remounting the tree", async () => {
    renderSwitch();
    const greeting = screen.getByTestId("greeting");
    expect(greeting).toHaveTextContent("Let's go!");

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(greeting).toHaveTextContent("চলো শুরু করি!"));
    // Same DOM node throughout: the strings were swapped in place, nothing
    // navigated or remounted (FR-I18N-03).
    expect(screen.getByTestId("greeting")).toBe(greeting);
  });

  it("offers the other language, labelled in its own script", async () => {
    renderSwitch();
    const button = screen.getByRole("button");

    expect(button).toHaveTextContent("বাংলা");
    expect(button).toHaveAttribute("lang", "bn");
    expect(button).toHaveAccessibleName("Switch to বাংলা");

    fireEvent.click(button);

    await waitFor(() => expect(button).toHaveTextContent("English"));
    expect(button).toHaveAttribute("lang", "en");
  });

  it("persists the choice to the locale cookie", async () => {
    renderSwitch();

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(document.cookie).toContain(`${LOCALE_COOKIE_NAME}=bn`),
    );
  });

  it("keeps <html lang> in step so the Bangla font stack applies", async () => {
    renderSwitch();

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(document.documentElement.lang).toBe("bn"));
  });

  it("meets the kid touch-target minimum by default", () => {
    renderSwitch();

    expect(screen.getByRole("button")).toHaveClass("h-16", "min-w-16");
  });
});
