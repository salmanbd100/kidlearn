"use client";

import { Button } from "@kidlearn/ui";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PARENT_NAMESPACE } from "@/shared/lib/i18n";

/**
 * A render-time throw inside a parent screen. Sits inside the parent layout, so
 * the theme and the top bar survive it; the root boundary would drop both and
 * show the kid surface's error.
 */
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
