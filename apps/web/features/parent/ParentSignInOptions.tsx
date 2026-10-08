"use client";

import { PARENT_NAMESPACE } from "@kidlearn/i18n";
import { Button } from "@kidlearn/ui";
import { ShieldCheck, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GoogleIcon } from "./GoogleIcon";
import { googleSignInUrl } from "./parent-api";

/** The Google button and its two notes, shared by the homepage dialog and the bare sign-in page. */
export function ParentSignInOptions() {
  const { t } = useTranslation(PARENT_NAMESPACE);

  return (
    <>
      <Button asChild size="lg" variant="outline" className="w-full">
        <a href={googleSignInUrl()}>
          <GoogleIcon />
          {t("login.google")}
        </a>
      </Button>
      <div className="flex flex-col gap-2 border-border border-t pt-5 text-muted-foreground text-sm">
        <p className="flex items-start gap-2">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("login.privacy")}
        </p>
        <p className="flex items-start gap-2">
          <UserPlus aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("login.newHere")}
        </p>
      </div>
    </>
  );
}
