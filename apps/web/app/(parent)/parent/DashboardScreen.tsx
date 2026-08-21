"use client";

import type { DashboardData } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import { Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useParentGate,
  useParentSession,
} from "@/app/(parent)/context/parent-session";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { ChildSwitcher } from "@/components/parent/ChildSwitcher";
import { DashboardSummary } from "@/components/parent/DashboardSummary";
import { getDashboard } from "@/lib/dashboard-api";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { PARENT_ROUTES } from "@/lib/parent-redirect";

/**
 * `/parent` — the dashboard a parent lands on (FR-DASH-01..04).
 *
 * The profile list comes from the session context, which loaded it to decide
 * whether onboarding was finished; fetching it again would be a second request for
 * an answer already on the page and two copies free to disagree. So the summary is
 * the **only** call this screen makes, which is what the one-endpoint shape of
 * `GET /api/children/{id}/dashboard` is for.
 *
 * Selection comes in as a prop from the server component, which read `?child=`.
 * That keeps the choice in the URL — refresh, back and a bookmarked link all work —
 * without this component owning routing. An id naming no profile the parent owns
 * (a deleted child, a hand-edited URL) silently falls back to the first, because
 * the alternative is an error screen about a query parameter.
 *
 * Every call is wrapped in `guard`: the endpoint is PIN-gated, so a grant that
 * lapsed between the page loading and the fetch landing must re-open the PIN pad
 * rather than show a parent an error they cannot act on.
 */
export function DashboardScreen({
  selectedChildId,
}: {
  selectedChildId: string | undefined;
}) {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { children: profiles } = useParentSession();
  const { guard } = useParentGate();

  /**
   * The payload and the instant it arrived, as one value.
   *
   * Together because every relative date on the screen is measured from that
   * instant, and a clock read during render would make the component's output
   * depend on when React happened to call it.
   */
  const [loaded, setLoaded] = useState<
    { data: DashboardData; at: Date } | undefined
  >();
  const [status, setStatus] = useState<
    "loading" | "waking" | "ready" | "error"
  >("loading");

  const child =
    profiles?.find((profile) => profile.id === selectedChildId) ??
    profiles?.[0];
  const childId = child?.id;

  useEffect(() => {
    if (childId === undefined) return;

    let isCurrent = true;
    setStatus("loading");
    // Cleared, not kept: without this, switching tabs shows the previous child's
    // figures under the new child's name until the request lands.
    setLoaded(undefined);

    void guard(
      getDashboard(childId, {
        // The API sleeps on its free tier; the first request after idle takes
        // seconds. Saying so beats a spinner that looks broken (NFR-PERF-04).
        onColdStart: () => {
          if (isCurrent) setStatus("waking");
        },
      }),
    ).then((result) => {
      if (!isCurrent) return;
      if (result.ok) {
        setLoaded({ data: result.data, at: new Date() });
        setStatus("ready");
        return;
      }
      setStatus("error");
    });

    return () => {
      isCurrent = false;
    };
    // Keyed on the child alone, which is what `guard` being a stable callback
    // buys (see `parent-session.tsx`): were it rebuilt on each lock/unlock, an
    // expiring grant would re-run this effect, clear the figures below and leave
    // a 403's error state under the PIN pad.
  }, [childId, guard]);

  // `ParentGuard` does not render this screen until the profiles have loaded and
  // there is at least one, but a parent who just deleted their last profile sees
  // this state briefly before the redirect lands.
  if (profiles === undefined || child === undefined) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {t("children.loading")}
      </p>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-5 py-2">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl text-foreground">
            {t("dashboard.title", { name: child.firstName })}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("dashboard.subtitle")}
          </p>
        </div>
        <LanguageSwitch size="default" />
      </header>

      <ChildSwitcher profiles={profiles} selectedChildId={child.id} />

      {status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {t("errors.generic")}
        </p>
      ) : loaded === undefined ? (
        <p role="status" className="text-muted-foreground text-sm">
          {status === "waking" ? t("dashboard.waking") : t("dashboard.loading")}
        </p>
      ) : (
        <DashboardSummary
          data={loaded.data}
          childName={child.firstName}
          now={loaded.at}
        />
      )}

      <Button asChild variant="outline" className="self-start">
        <Link href={PARENT_ROUTES.children}>
          <Users aria-hidden="true" />
          {t("dashboard.manageChildren")}
        </Link>
      </Button>
    </main>
  );
}
