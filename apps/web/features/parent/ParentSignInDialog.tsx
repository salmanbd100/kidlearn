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
import { useTranslation } from "react-i18next";
import { useQueryDialog } from "@/shared/hooks/use-query-dialog";
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
        <DialogContent size="sm" closeLabel={t("login.close")}>
          <DialogHeader>
            <DialogTitle className="text-2xl">{t("login.title")}</DialogTitle>
            <DialogDescription>{t("login.subtitle")}</DialogDescription>
          </DialogHeader>
          <Button asChild size="lg" className="w-full">
            <a href={googleSignInUrl()}>{t("login.google")}</a>
          </Button>
          <p className="text-center text-muted-foreground text-xs">
            {t("login.privacy")}
          </p>
        </DialogContent>
      </Dialog>
    </ThemeScope>
  );
}
