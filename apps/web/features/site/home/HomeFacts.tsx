"use client";

import { cn } from "@kidlearn/ui";
import { useSiteTranslation } from "../use-site-translation";
import { Reveal } from "./Reveal";

// Brand tints on the cards are decorative; the number and its label carry the meaning.
const FACTS = [
  { key: "ages", tint: "bg-sky/15" },
  { key: "languages", tint: "bg-grape/10" },
  { key: "ways", tint: "bg-mint/20" },
  { key: "ads", tint: "bg-sunshine/25" },
] as const;

export function HomeFacts() {
  const { t } = useSiteTranslation();

  return (
    <section aria-label={t("home.factsLabel")}>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {FACTS.map(({ key, tint }, index) => (
          <li key={key}>
            <Reveal
              delay={0.08 * index}
              className={cn(
                "flex h-full flex-col gap-1 rounded-(--radius) px-5 py-5 sm:px-6",
                tint,
              )}
            >
              <span className="font-display text-5xl font-semibold tabular-nums">
                {t(`home.facts.${key}.value`)}
              </span>
              <span className="text-lg leading-snug text-muted-foreground">
                {t(`home.facts.${key}.label`)}
              </span>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
