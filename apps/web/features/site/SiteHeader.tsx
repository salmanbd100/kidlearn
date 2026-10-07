"use client";

import { SITE_NAMESPACE } from "@kidlearn/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { LanguageSwitch } from "@/shared/components/LanguageSwitch";
import { SITE_ROUTES } from "./site-routes";

const GUIDE_LINKS = [
  { href: SITE_ROUTES.parentGuide, labelKey: "nav.parents" },
  { href: SITE_ROUTES.adminGuide, labelKey: "nav.admins" },
  { href: SITE_ROUTES.engineeringGuide, labelKey: "nav.engineering" },
] as const;

export function SiteHeader() {
  const { t } = useTranslation(SITE_NAMESPACE);
  const pathname = usePathname();

  return (
    <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-8 sm:py-6">
      <Link
        href={SITE_ROUTES.home}
        className="focus-ring mr-auto inline-flex min-h-11 items-center rounded-sm font-display text-2xl font-semibold"
      >
        {t("brand")}
      </Link>
      <LanguageSwitch size="default" />
      <nav
        aria-label={t("nav.label")}
        className="order-last w-full md:order-none md:w-auto"
      >
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {GUIDE_LINKS.map(({ href, labelKey }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                className="focus-ring inline-flex min-h-11 items-center rounded-sm text-lg underline-offset-8 hover:underline aria-[current=page]:font-bold aria-[current=page]:underline aria-[current=page]:decoration-sunshine aria-[current=page]:decoration-4"
              >
                {t(labelKey)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
