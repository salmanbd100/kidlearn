"use client";

import { useEffect } from "react";
import { DEFAULT_NAMESPACE, getI18n } from "@/shared/lib/i18n";
import { LOCALE_COOKIE_NAME, toLocale } from "@/shared/lib/locale";
import "./globals.css";

/**
 * The last resort: it replaces the root layout, so there is no provider tree
 * and no i18n context — the copy is read straight from the instance, in the
 * language the locale cookie names.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[kidlearn] root layout render failed", error);
  }, [error]);

  const locale = toLocale(readLocaleCookie());
  const i18n = getI18n(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6 text-center font-body text-foreground"
      >
        <p role="alert" className="text-2xl">
          {i18n.t("errors.unknown", { ns: DEFAULT_NAMESPACE })}
        </p>
        <button
          type="button"
          onClick={reset}
          className="min-h-16 rounded-pill bg-primary px-8 text-primary-foreground text-xl touch-manipulation focus-ring"
        >
          {i18n.t("actions.tryAgain", { ns: DEFAULT_NAMESPACE })}
        </button>
      </body>
    </html>
  );
}

function readLocaleCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE_NAME}=`))
    ?.split("=")[1];
}
