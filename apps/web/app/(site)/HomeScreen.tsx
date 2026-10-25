"use client";

import { Button, cn } from "@kidlearn/ui";
import {
  Languages,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCheck,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Suspense } from "react";
import { AdminSignInDialog } from "@/features/admin/shell/AdminSignInDialog";
import { ADMIN_ROUTES } from "@/features/admin/shell/admin-routes";
import { ParentSignInDialog } from "@/features/parent/ParentSignInDialog";
import { PARENT_ROUTES } from "@/features/parent/parent-redirect";
import { HangingSection, toNumeral } from "@/features/site/HangingSection";
import { BuiltInTheOpen } from "@/features/site/home/BuiltInTheOpen";
import { HeroHeadline } from "@/features/site/home/HeroHeadline";
import { HeroScene } from "@/features/site/home/HeroScene";
import { HomeFacts } from "@/features/site/home/HomeFacts";
import { HomeSectionTitle } from "@/features/site/home/HomeSectionTitle";
import { HowItWorks } from "@/features/site/home/HowItWorks";
import { ParentPreview } from "@/features/site/home/ParentPreview";
import { PlayGallery } from "@/features/site/home/PlayGallery";
import { Reveal } from "@/features/site/home/Reveal";
import { SITE_ROUTES } from "@/features/site/site-routes";
import { useIsMotionReducedAfterHydration } from "@/features/site/use-is-motion-reduced-after-hydration";
import { useSignedInRole } from "@/features/site/use-signed-in-role";
import { useSiteTranslation } from "@/features/site/use-site-translation";
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
  const { t } = useSiteTranslation();
  const isMotionReduced = useIsMotionReducedAfterHydration();
  const role = useSignedInRole();

  return (
    <div className="flex flex-col gap-16 md:gap-24">
      <section
        aria-labelledby="home-title"
        className="grid items-center gap-10 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:gap-12"
      >
        <div className="flex flex-col gap-8">
          <motion.div
            key={isMotionReduced ? "still" : "moving"}
            data-testid="home-headline"
            className="flex flex-col items-start gap-5"
            // Reduced motion gets the settled headline: Motion's inline transform is out of reach of the CSS reset.
            initial={isMotionReduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
          >
            <p className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-card px-4 py-1.5 text-lg font-semibold">
              <Sparkles aria-hidden="true" className="size-5 text-primary" />
              {t("home.eyebrow")}
            </p>
            {/* The header already carries the logo; here the words say what the app is for. */}
            <HeroHeadline id="home-title" />
          </motion.div>
          <p className="max-w-[36rem] text-2xl leading-snug sm:text-3xl">
            {t("home.lead")}
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Button asChild size="kid">
              {/* The portal needs a parent's session: signed out, ask for it here rather than on the bare page. */}
              {role === "signedOut" ? (
                <Link href={PARENT_ROUTES.login} replace scroll={false}>
                  {t("home.startLearning")}
                </Link>
              ) : (
                <Link href={STUDENT_ROUTES.selectProfile}>
                  {t("home.startLearning")}
                </Link>
              )}
            </Button>
            {role === "parent" ? (
              <Button asChild size="kid" variant="outline">
                <Link href={PARENT_ROUTES.dashboard}>
                  {t("home.parentDashboard")}
                </Link>
              </Button>
            ) : (
              <Button asChild size="kid" variant="outline">
                <Link href={PARENT_ROUTES.login} replace scroll={false}>
                  {t("home.parentSignIn")}
                </Link>
              </Button>
            )}
          </div>
          {/* Deliberately quiet: the two actions above are the front door, this one is staff-only.
              A signed-in admin gets it as the way back in; a signed-in parent is signed out on the way. */}
          <Link
            href={
              role === "admin" ? ADMIN_ROUTES.analytics : ADMIN_ROUTES.login
            }
            // The dialog opens over this page: keep the scroll, and replace rather than push so Back after
            // closing it leaves the homepage. The CMS is a new page, with its own entry and scroll.
            replace={role !== "admin"}
            scroll={role === "admin"}
            className="focus-ring -mt-4 inline-flex min-h-11 w-fit items-center rounded-sm text-lg text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {role === "admin"
              ? t("home.adminDashboard")
              : t("home.adminSignIn")}
          </Link>
        </div>
        <HeroScene className="mx-auto max-w-sm md:max-w-none" />
      </section>

      <HomeFacts />

      <section
        aria-labelledby="how-title"
        className="flex flex-col gap-8 rounded-[2rem] bg-sky/10 px-5 py-10 sm:px-10 md:py-14"
      >
        <HomeSectionTitle id="how-title" tone="coral">
          {t("home.howTitle")}
        </HomeSectionTitle>
        <HowItWorks />
      </section>

      <section aria-labelledby="play-title" className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <HomeSectionTitle id="play-title" tone="grape">
            {t("home.playTitle")}
          </HomeSectionTitle>
          <p className="max-w-[40rem] text-xl leading-relaxed text-muted-foreground">
            {t("home.playLead")}
          </p>
        </div>
        <PlayGallery />
      </section>

      <section
        aria-labelledby="parents-title"
        className="flex flex-col gap-8 rounded-[2rem] bg-mint/10 px-5 py-10 sm:px-10 md:py-14"
      >
        <HomeSectionTitle id="parents-title" tone="mint">
          {t("home.parentsTitle")}
        </HomeSectionTitle>
        <ParentPreview />
      </section>

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

      <section
        aria-labelledby="built-title"
        className="flex flex-col gap-8 rounded-[2rem] bg-grape/10 px-5 py-10 sm:px-10 md:py-14"
      >
        <HomeSectionTitle id="built-title" tone="sky">
          {t("home.builtTitle")}
        </HomeSectionTitle>
        <BuiltInTheOpen />
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
                  className="focus-ring inline-flex min-h-11 w-fit items-center rounded-sm text-2xl font-bold underline decoration-accent decoration-4 underline-offset-8 hover:decoration-foreground"
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

      {/* Read the query string, so they suspend rather than forcing the page to client-render. */}
      <Suspense fallback={null}>
        <ParentSignInDialog />
        <AdminSignInDialog isParentSignedIn={role === "parent"} />
      </Suspense>
    </div>
  );
}
