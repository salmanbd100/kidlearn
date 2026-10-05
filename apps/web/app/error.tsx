"use client";

import { DEFAULT_NAMESPACE } from "@kidlearn/i18n";
import { Button } from "@kidlearn/ui";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * Catches a render-time throw anywhere below the root layout. Content is data,
 * so one malformed payload or unlisted asset host can throw in a route that
 * shipped fine — this is what keeps that from being Next's bare error page.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation(DEFAULT_NAMESPACE);

  useEffect(() => {
    console.error("[kidlearn] route render failed", error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <p role="alert" className="font-display text-2xl text-foreground">
        {t("errors.unknown")}
      </p>
      <Button size="kid" onClick={reset}>
        {t("actions.tryAgain")}
      </Button>
    </main>
  );
}
