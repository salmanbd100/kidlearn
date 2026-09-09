"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { resolveParentRedirect } from "@/lib/parent-redirect";
import { useParentSession } from "./context/parent-session";

/** The redirect gate every `(parent)` page sits behind. */
export function ParentGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const router = useRouter();
  const pathname = usePathname();
  const { status, parent, children: profiles } = useParentSession();

  const redirectTo =
    status === "loading" || status === "error"
      ? undefined
      : resolveParentRedirect(
          { parent, childCount: profiles?.length },
          pathname,
        );

  useEffect(() => {
    // `replace`, not `push`: a redirect the parent did not ask for must not become
    // a back-button trap between two onboarding steps.
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
      <p role="alert" className="text-destructive text-sm">
        {t("errors.network")}
      </p>
    );
  }

  // A redirect is queued; showing the current page for a frame would show the
  // wrong one.
  if (redirectTo !== undefined) return null;

  return <>{children}</>;
}
