"use client";

import { Button, type ButtonProps } from "@kidlearn/ui";
import { useTranslation } from "react-i18next";
import { type Locale, toLocale } from "@/lib/locale";

/** English ⇄ Bangla, with no page navigation (FR-I18N-02, FR-I18N-03). */
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
