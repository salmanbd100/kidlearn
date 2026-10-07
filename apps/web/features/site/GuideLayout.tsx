"use client";

import { SITE_NAMESPACE } from "@kidlearn/i18n";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Doodle } from "./Doodle";
import { ExternalLink } from "./ExternalLink";
import { HangingSection, toNumeral } from "./HangingSection";
import { REPO_DOC_URL } from "./site-routes";

export interface GuideSection {
  id: string;
  titleKey: string;
  /** Relative to `document/`, with an optional `#anchor`. */
  docPath?: string;
  content: ReactNode;
}

/** The booklet frame every guide shares; the contents list and the anchors come from one array, so they cannot drift. */
export function GuideLayout({
  readerKey,
  titleKey,
  leadKey,
  sections,
}: {
  readerKey: string;
  titleKey: string;
  leadKey: string;
  sections: readonly GuideSection[];
}) {
  const { t } = useTranslation(SITE_NAMESPACE);

  return (
    <article className="flex flex-col gap-12 md:gap-16">
      <header className="grid gap-4 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:gap-12">
        <p className="text-lg font-bold text-muted-foreground md:pt-4">
          {t(readerKey)}
        </p>
        <div className="flex max-w-[65ch] flex-col gap-5">
          <h1 className="font-display text-[clamp(2.5rem,7vw,4rem)] font-semibold leading-[1.05] tracking-[-0.01em]">
            {t(titleKey)}
          </h1>
          <p className="text-xl leading-relaxed sm:text-2xl">{t(leadKey)}</p>
        </div>
      </header>

      <nav
        aria-labelledby="on-this-page"
        className="grid gap-4 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:gap-12"
      >
        <h2 id="on-this-page" className="text-lg font-bold">
          {t("guide.onThisPage")}
        </h2>
        <ol className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {sections.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="focus-ring flex min-h-11 items-baseline gap-3 rounded-sm py-2 text-lg underline-offset-4 hover:underline"
              >
                <span className="tabular-nums text-muted-foreground">
                  {toNumeral(index)}
                </span>
                {t(section.titleKey)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((section, index) => (
        <HangingSection
          key={section.id}
          id={section.id}
          numeral={toNumeral(index)}
          title={t(section.titleKey)}
          marginMark={
            index === 0 ? <Doodle kind="squiggle" tone="coral" /> : undefined
          }
        >
          {section.content}
          {section.docPath !== undefined ? (
            <p>
              <ExternalLink href={REPO_DOC_URL(section.docPath)}>
                {t("guide.readFull")}
              </ExternalLink>
            </p>
          ) : null}
        </HangingSection>
      ))}
    </article>
  );
}
