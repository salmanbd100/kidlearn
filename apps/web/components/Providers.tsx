"use client";

import { type ReactNode, useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import { getI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { AudioProvider } from "./AudioProvider";

/** The client-side context the whole app sits inside. */
export function Providers({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const i18n = getI18n(locale);

  // `<html lang>` is rendered by the server and must follow a client-side
  // switch: it is what picks the Bangla font stack and what a screen reader
  // uses to choose a voice. Bound to the instance rather than to the switch
  // component, so any caller of `changeLanguage` keeps it in step.
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
