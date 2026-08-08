"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PinGate } from "@/components/parent/PinGate";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import {
  isGateExemptPath,
  isPublicParentPath,
  resolveParentRedirect,
} from "@/lib/parent-redirect";
import { useParentGate, useParentSession } from "./context/parent-session";

/**
 * The two gates every `(parent)` page sits behind.
 *
 * **Onboarding order** (FR-AUTH-02..04, FR-PROF-01) is decided by
 * `resolveParentRedirect`, which is a pure function so that the rule "no child
 * profile UI is reachable before consent" is provable by assertion rather than by
 * clicking through the app. This component only carries out its verdict.
 *
 * **The PIN gate** (FR-AUTH-04) renders on top of the page rather than instead of
 * it, so a parent who was halfway through a form when the 15-minute grant lapsed
 * still has it when they unlock.
 *
 * While the session is loading, nothing is rendered but a status line. Rendering
 * the page first would flash a profile list at someone who turns out to be signed
 * out, which is a content-safety problem and not only a visual one.
 */
export function ParentGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const router = useRouter();
  const pathname = usePathname();
  const { status, parent, children: profiles } = useParentSession();
  const { isLocked } = useParentGate();

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

  const isGated =
    !isPublicParentPath(pathname) && !isGateExemptPath(pathname) && isLocked;

  return (
    <>
      {children}
      {isGated ? <PinGate /> : null}
    </>
  );
}
