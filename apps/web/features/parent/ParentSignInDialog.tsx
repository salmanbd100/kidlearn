"use client";

import { PARENT_NAMESPACE } from "@kidlearn/i18n";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ThemeScope,
} from "@kidlearn/ui";
import { HeartHandshake, ShieldCheck, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryDialog } from "@/shared/hooks/use-query-dialog";
import { GoogleIcon } from "./GoogleIcon";
import { googleSignInUrl } from "./parent-api";
import { PARENT_SIGN_IN_PARAM } from "./parent-redirect";

/** The parent sign-in screen, as a dialog over the homepage; `PARENT_ROUTES.login` opens it. */
export function ParentSignInDialog() {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { isOpen, onOpenChange } = useQueryDialog(PARENT_SIGN_IN_PARAM);

  return (
    // A parent surface on a kid-themed page; the scope carries the theme into the portal.
    <ThemeScope theme="parent" className="contents font-ui text-foreground">
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent
          size="sm"
          closeLabel={t("login.close")}
          className="gap-6 p-8"
        >
          {/* Centred, so `flush`: the close button sits above the icon, clear of the title. */}
          <DialogHeader
            gutter="flush"
            className="items-center gap-3 text-center"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <HeartHandshake aria-hidden="true" className="size-7" />
            </span>
            <DialogTitle className="text-2xl">{t("login.title")}</DialogTitle>
            <DialogDescription className="text-base leading-relaxed">
              {t("login.subtitle")}
            </DialogDescription>
          </DialogHeader>
          <Button asChild size="lg" variant="outline" className="w-full">
            <a href={googleSignInUrl()}>
              <GoogleIcon />
              {t("login.google")}
            </a>
          </Button>
          <div className="flex flex-col gap-2 border-border border-t pt-5 text-muted-foreground text-sm">
            <p className="flex items-start gap-2">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {t("login.privacy")}
            </p>
            <p className="flex items-start gap-2">
              <UserPlus aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t("login.newHere")}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </ThemeScope>
  );
}
