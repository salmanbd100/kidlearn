"use client";

import { Button, type ButtonProps } from "@kidlearn/ui";
import { useTranslation } from "react-i18next";
import { type Locale, toLocale } from "@/lib/locale";

/**
 * English ⇄ Bangla, with no page navigation (FR-I18N-02, FR-I18N-03).
 *
 * The button shows the language you would get by pressing it, labelled in its
 * own script and marked with `lang` so it renders in the Bangla font even while
 * the interface is still English — a parent scanning for "বাংলা" finds it
 * without being able to read the surrounding UI.
 *
 * `changeLanguage` swaps the bundled resources in place; the cookie is written
 * by i18next's detector cache (`lib/i18n.ts`), so the choice survives a reload.
 */
export function LanguageSwitch({
  size = "kid",
}: {
  size?: ButtonProps["size"];
}) {
  const { t, i18n } = useTranslation();

  const current = toLocale(i18n.resolvedLanguage);
  const next: Locale = current === "en" ? "bn" : "en";
  const nextLabel = t(`language.${next}`);

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      lang={next}
      aria-label={t("language.switchTo", { language: nextLabel })}
      onClick={() => {
        void i18n.changeLanguage(next);
      }}
    >
      {nextLabel}
    </Button>
  );
}
