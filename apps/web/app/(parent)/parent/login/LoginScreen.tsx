"use client";

import { Button } from "@kidlearn/ui";
import { useTranslation } from "react-i18next";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { googleSignInUrl } from "@/lib/parent-api";

/** Google, and nothing else (FR-AUTH-02). */
export function LoginScreen() {
  const { t } = useTranslation(PARENT_NAMESPACE);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 py-12">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="font-semibold text-2xl text-foreground">
          {t("login.title")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("login.subtitle")}</p>
      </div>

      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        <Button asChild size="lg" className="w-full">
          <a href={googleSignInUrl()}>{t("login.google")}</a>
        </Button>
        <p className="text-center text-muted-foreground text-xs">
          {t("login.privacy")}
        </p>
        <LanguageSwitch size="default" />
      </div>
    </main>
  );
}
