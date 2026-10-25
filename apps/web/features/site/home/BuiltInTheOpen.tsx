"use client";

import Link from "next/link";
import { ExternalLink } from "../ExternalLink";
import { REPO_URL, SITE_ROUTES } from "../site-routes";
import { useSiteTranslation } from "../use-site-translation";
import { Reveal } from "./Reveal";

// Product names, the same in every language — not i18n strings.
const STACK = [
  "Next.js 16",
  "React 19",
  "TypeScript",
  "Tailwind CSS v4",
  "Motion",
  "Express 5",
  "Prisma",
  "PostgreSQL",
  "better-auth",
  "OpenAPI",
  "Turborepo",
  "Vitest",
] as const;

export function BuiltInTheOpen() {
  const { t } = useSiteTranslation();

  return (
    <div className="flex flex-col gap-8">
      <Reveal>
        <p className="max-w-[48rem] text-xl leading-relaxed sm:text-2xl">
          {t("home.builtLead")}
        </p>
      </Reveal>
      <Reveal delay={0.1}>
        <ul className="flex flex-wrap gap-2">
          {STACK.map((name) => (
            <li
              key={name}
              lang="en"
              className="rounded-full border-2 border-border bg-card px-4 py-2 font-semibold"
            >
              {name}
            </li>
          ))}
        </ul>
      </Reveal>
      <div className="flex flex-col gap-2 text-lg sm:flex-row sm:items-center sm:gap-8">
        <Link
          href={SITE_ROUTES.engineeringGuide}
          className="focus-ring inline-flex min-h-11 w-fit items-center rounded-sm font-bold underline decoration-accent decoration-4 underline-offset-8 hover:decoration-foreground"
        >
          {t("home.builtGuide")}
        </Link>
        <ExternalLink href={REPO_URL}>{t("home.builtSource")}</ExternalLink>
      </div>
    </div>
  );
}
