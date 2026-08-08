"use client";

import { Check, Play, Repeat } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BigButton } from "@/components/kid/BigButton";
import { IconTile } from "@/components/kid/IconTile";
import { LanguageSwitch } from "@/components/LanguageSwitch";

/**
 * Everything file 13 ships, on one screen: kid tokens, both locales, the
 * primitives and their touch targets. Deleted when file 15 lands the real
 * profile picker.
 */
export function ShellShowcase() {
  const { t } = useTranslation();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="font-display text-[clamp(2.5rem,8vw,3.5rem)] leading-none">
          {t("app.name")}
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          {t("app.tagline")}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <IconTile label={t("actions.play")} icon={<Play aria-hidden />} />
        <IconTile label={t("actions.tryAgain")} icon={<Repeat aria-hidden />} />
        <IconTile label={t("actions.done")} icon={<Check aria-hidden />} />
      </div>

      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        <BigButton size="lg">{t("actions.letsGo")}</BigButton>
        <LanguageSwitch />
      </div>
    </main>
  );
}
