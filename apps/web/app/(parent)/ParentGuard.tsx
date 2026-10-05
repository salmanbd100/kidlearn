"use client";

import { PARENT_NAMESPACE } from "@kidlearn/i18n";
import { Button } from "@kidlearn/ui";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { resolveParentRedirect } from "@/features/parent/parent-redirect";
import { useParentSession } from "./context/parent-session";

export function ParentGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const router = useRouter();
  const pathname = usePathname();
  const { status, parent, children: profiles, refresh } = useParentSession();

  const redirectTo =
    status === "loading" || status === "error"
      ? undefined
      : resolveParentRedirect(
          { parent, childCount: profiles?.length },
          pathname,
        );

  useEffect(() => {
    // `replace`: a redirect the parent did not ask for must not become a back-button trap.
    if (redirectTo !== undefined) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (status === "loading") {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {t("children.loading")}
      </p>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-destructive text-sm">
          {t("errors.network")}
        </p>
        <Button variant="outline" onClick={() => void refresh()}>
          {t("errors.retry")}
        </Button>
      </div>
    );
  }

  // A redirect is queued; showing the current page for a frame would show the wrong one.
  if (redirectTo !== undefined) return null;

  return <>{children}</>;
}
