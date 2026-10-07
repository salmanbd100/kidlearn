"use client";

import { SITE_NAMESPACE } from "@kidlearn/i18n";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** A link off the site: opens in a new tab and says so, visually and to a screen reader. */
export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const { t } = useTranslation(SITE_NAMESPACE);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-ring inline-flex min-h-11 items-center gap-1 rounded-sm font-semibold text-foreground underline decoration-sky decoration-2 underline-offset-4 hover:decoration-foreground"
    >
      {children} <ArrowUpRight aria-hidden="true" className="size-5 shrink-0" />
      <span className="sr-only">{t("external.newTab")}</span>
    </a>
  );
}
