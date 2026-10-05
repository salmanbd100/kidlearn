"use client";

import { DEFAULT_NAMESPACE } from "@kidlearn/i18n";
import { Button } from "@kidlearn/ui";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { PARENT_ROUTES } from "@/features/parent/parent-redirect";

/** Reached through `parent/[...missing]` — an unknown `/parent/*` URL. */
export default function ParentNotFound() {
  const { t } = useTranslation(DEFAULT_NAMESPACE);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
      <p className="text-foreground">{t("errors.notFound")}</p>
      <Button asChild>
        <Link href={PARENT_ROUTES.dashboard}>{t("actions.goHome")}</Link>
      </Button>
    </main>
  );
}
