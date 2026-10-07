"use client";

import { SITE_NAMESPACE } from "@kidlearn/i18n";
import { Button, cn, useIsMotionReduced } from "@kidlearn/ui";
import { Languages, ShieldCheck, Trophy, UserCheck } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { AdminSignInDialog } from "@/features/admin/AdminSignInDialog";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";
import { ParentSignInDialog } from "@/features/parent/ParentSignInDialog";
import { PARENT_ROUTES } from "@/features/parent/parent-redirect";
import { Doodle } from "@/features/site/Doodle";
import { HangingSection, toNumeral } from "@/features/site/HangingSection";
import { HeroScene } from "@/features/site/HeroScene";
import { HowItWorks } from "@/features/site/HowItWorks";
import { Reveal } from "@/features/site/Reveal";
import { SITE_ROUTES } from "@/features/site/site-routes";
import { useSignedInRole } from "@/features/site/use-signed-in-role";
import { STUDENT_ROUTES } from "@/features/student/student-routes";

const GUIDES = [
  { href: SITE_ROUTES.parentGuide, key: "parents" },
  { href: SITE_ROUTES.adminGuide, key: "admins" },
  { href: SITE_ROUTES.engineeringGuide, key: "engineering" },
] as const;

// Brand hues tint the icon discs: decorative, and the icon is never the only carrier of meaning.
const DIFFERENCES = [
  { key: "safe", Icon: ShieldCheck, tint: "bg-mint/25" },
  { key: "reviewed", Icon: UserCheck, tint: "bg-grape/15" },
  { key: "languages", Icon: Languages, tint: "bg-sky/20" },
  { key: "server", Icon: Trophy, tint: "bg-sunshine/30" },
] as const;

export function HomeScreen() {
  const { t } = useTranslation(SITE_NAMESPACE);
  const isMotionReduced = useIsMotionReduced();
  const role = useSignedInRole();

  return (
    <div className="flex flex-col gap-16 md:gap-24">
      <section
        aria-labelledby="home-title"
        className="grid items-center gap-10 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:gap-12"
      >
        <div className="flex flex-col gap-8">
          <motion.div
            data-testid="home-headline"
            className="flex w-fit flex-col"
            // Reduced motion gets the settled headline: Motion's inline transform is out of reach of the CSS reset.
            initial={isMotionReduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
          >
            {/* Height caps it too: on a landscape tablet the full 7rem pushed both actions below the fold. */}
            <h1
              id="home-title"
              className="font-display text-[clamp(3.5rem,min(13vw,15dvh),7rem)] font-semibold leading-[0.95] tracking-[-0.01em]"
            >
              {t("brand")}
            </h1>
            <Doodle kind="underline" />
          </motion.div>
          <p className="max-w-[36rem] text-2xl leading-snug sm:text-3xl">
            {t("home.lead")}
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button asChild size="kid">
              <Link href={STUDENT_ROUTES.selectProfile}>
                {t("home.startLearning")}
              </Link>
            </Button>
            {role === "parent" ? (
              <Button asChild size="kid" variant="outline">
                <Link href={PARENT_ROUTES.dashboard}>
                  {t("home.parentDashboard")}
                </Link>
              </Button>
            ) : (
              <Button asChild size="kid" variant="outline">
                <Link href={PARENT_ROUTES.login} scroll={false}>
                  {t("home.parentSignIn")}
                </Link>
              </Button>
            )}
          </div>
          {/* Deliberately quiet: the two actions above are the front door, this one is staff-only.
              A signed-in parent has no use for it; a signed-in admin gets it as the way back in. */}
          {role === "parent" ? null : (
            <Link
              href={
                role === "admin" ? ADMIN_ROUTES.analytics : ADMIN_ROUTES.login
              }
              scroll={false}
              className="focus-ring -mt-4 inline-flex min-h-11 w-fit items-center rounded-sm text-lg text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {role === "admin"
                ? t("home.adminDashboard")
                : t("home.adminSignIn")}
            </Link>
          )}
        </div>
        <HeroScene className="mx-auto max-w-sm md:max-w-none" />
      </section>

      <section
        aria-labelledby="how-title"
        className="flex flex-col gap-8 rounded-[2rem] bg-sky/10 px-5 py-10 sm:px-10 md:py-14"
      >
        <Reveal className="flex items-center gap-3">
          <h2
            id="how-title"
            className="font-display text-3xl font-semibold sm:text-4xl"
          >
            {t("home.howTitle")}
          </h2>
          <Doodle kind="squiggle" tone="coral" />
        </Reveal>
        <HowItWorks />
      </section>

      <HangingSection id="guides" title={t("home.guidesTitle")}>
        <ol className="flex flex-col">
          {GUIDES.map(({ href, key }, index) => (
            <li
              key={key}
              className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2 border-foreground/15 border-b py-5 first:pt-0 last:border-b-0"
            >
              <span className="pt-1 text-lg font-bold tabular-nums text-muted-foreground">
                {toNumeral(index)}
              </span>
              <Reveal delay={0.1 * index} className="flex flex-col gap-1">
                <Link
                  href={href}
                  className="focus-ring inline-flex min-h-11 w-fit items-center rounded-sm text-2xl font-bold underline decoration-sunshine decoration-4 underline-offset-8 hover:decoration-foreground"
                >
                  {t(`home.guides.${key}.title`)}
                </Link>
                <p className="leading-relaxed text-muted-foreground">
                  {t(`home.guides.${key}.description`)}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>
      </HangingSection>

      <HangingSection id="different" title={t("home.differentTitle")}>
        <ul className="grid gap-8 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
          {DIFFERENCES.map(({ key, Icon, tint }, index) => (
            <li key={key}>
              <Reveal delay={0.08 * index} className="flex gap-4">
                <span
                  className={cn(
                    "flex size-12 shrink-0 items-center justify-center rounded-full text-foreground",
                    tint,
                  )}
                >
                  <Icon aria-hidden="true" className="size-6" />
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="font-bold">
                    {t(`home.different.${key}.term`)}
                  </h3>
                  <p className="text-muted-foreground">
                    {t(`home.different.${key}.detail`)}
                  </p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </HangingSection>

      {/* Read the query string, so they suspend rather than forcing the page to client-render. */}
      <Suspense fallback={null}>
        <ParentSignInDialog />
        <AdminSignInDialog />
      </Suspense>
    </div>
  );
}
