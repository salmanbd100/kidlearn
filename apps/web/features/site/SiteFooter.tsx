"use client";

import { ExternalLink } from "./ExternalLink";
import { REPO_URL } from "./site-routes";
import { useSiteTranslation } from "./use-site-translation";

export function SiteFooter() {
  const { t } = useSiteTranslation();

  return (
    <footer className="mx-auto w-full max-w-6xl px-4 pt-16 pb-10 sm:px-8">
      <div className="flex flex-col gap-3 border-t border-foreground/15 pt-8 text-lg md:flex-row md:items-center md:justify-between">
        <p className="max-w-[65ch] text-muted-foreground">
          {t("footer.about")}
        </p>
        <ExternalLink href={REPO_URL}>{t("footer.source")}</ExternalLink>
      </div>
    </footer>
  );
}
