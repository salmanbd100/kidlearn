"use client";

import { PARENT_NAMESPACE } from "@kidlearn/i18n";
import { HeartHandshake } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ParentSignInOptions } from "@/features/parent/ParentSignInOptions";
import { LanguageSwitch } from "@/shared/components/LanguageSwitch";

// The homepage dialog's content on a page of its own, with nothing on it that leads to the public site.
export function SignInScreen() {
  const { t } = useTranslation(PARENT_NAMESPACE);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HeartHandshake aria-hidden="true" className="size-7" />
          </span>
          <h1 className="font-semibold text-2xl text-foreground">
            {t("login.title")}
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            {t("login.subtitle")}
          </p>
        </div>
        <ParentSignInOptions />
      </div>
      <LanguageSwitch size="default" />
    </main>
  );
}
