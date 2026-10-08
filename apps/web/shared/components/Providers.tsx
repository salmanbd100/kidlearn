"use client";

import { type ReactNode, useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import { getI18n } from "@/shared/lib/i18n";
import type { Locale } from "@/shared/lib/locale";
import { AudioProvider } from "./AudioProvider";

export function Providers({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const i18n = getI18n(locale);

  // `<html lang>` is server-rendered and must follow a client-side switch (Bangla font stack, screen-reader voice);
  // bound to the instance so any `changeLanguage` caller keeps it in step.
  useEffect(() => {
    const syncDocumentLanguage = (language: string) => {
      document.documentElement.lang = language;
    };
    syncDocumentLanguage(i18n.resolvedLanguage ?? locale);
    i18n.on("languageChanged", syncDocumentLanguage);
    return () => i18n.off("languageChanged", syncDocumentLanguage);
  }, [i18n, locale]);

  return (
    <I18nextProvider i18n={i18n}>
      <AudioProvider>{children}</AudioProvider>
    </I18nextProvider>
  );
}
