"use client";

import { DEFAULT_NAMESPACE } from "@kidlearn/i18n";
import { Button } from "@kidlearn/ui";
import Link from "next/link";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation(DEFAULT_NAMESPACE);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <p className="font-display text-2xl text-foreground">
        {t("errors.notFound")}
      </p>
      <Button asChild size="kid">
        <Link href="/">{t("actions.goHome")}</Link>
      </Button>
    </main>
  );
}
