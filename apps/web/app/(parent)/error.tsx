"use client";

import { PARENT_NAMESPACE } from "@kidlearn/i18n";
import { Button } from "@kidlearn/ui";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

/** Sits inside the parent layout so the theme and top bar survive; the root boundary would drop both. */
export default function ParentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation(PARENT_NAMESPACE);

  useEffect(() => {
    console.error("[kidlearn] parent screen render failed", error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
      <p role="alert" className="text-foreground">
        {t("errors.generic")}
      </p>
      <Button onClick={reset}>{t("errors.retry")}</Button>
    </main>
  );
}
