"use client";

import type { ChildProfileResponse } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { PARENT_ROUTES } from "@/lib/parent-redirect";

/**
 * Which child's dashboard is showing (FR-DASH-01).
 *
 * **Links, not buttons.** The selection lives in `?child=`, so it is a URL and a
 * link is what a URL is reached by: refresh keeps the child, the back button walks
 * back through the ones the parent looked at, and `/parent?child=<id>` can be
 * bookmarked or shared between a parent's own devices. Buttons plus
 * `router.replace` would give none of that, and the tab a parent is on would be
 * lost by the reload a lapsed PIN grant causes.
 *
 * A `nav` with `aria-current`, rather than `role="tablist"`. Real tabs promise that
 * the panel is in the same document and that arrow keys move between them; this
 * navigates. Claiming the wrong pattern is worse for a screen-reader user than
 * claiming none.
 *
 * The badge is the child's initial, not their chosen character. `ChildCard` draws
 * real avatar art, but it can only do so because the list page fetched
 * `GET /api/characters` to turn an `avatarCharacterId` into a slug. This screen
 * makes exactly one data call besides the child list it already has, and a second
 * request for a decoration on a two-item switcher is not worth it.
 *
 * `basePath` is what lets the weekly report screen (file 30) reuse this instead of
 * growing a near-identical copy: the switcher's whole behaviour is "same page,
 * different `?child=`", and the page is the only part that differs. It defaults to
 * the dashboard, so the caller that predates it says nothing.
 *
 * Only `?child=` is carried across. A screen with further state in the query — the
 * report screen's `?week=` — deliberately loses it on a switch: a week another
 * child has no report for is not a state worth preserving into their tab.
 */
export interface ChildSwitcherProps {
  profiles: readonly ChildProfileResponse[];
  selectedChildId: string;
  basePath?: string;
}

export function ChildSwitcher({
  profiles,
  selectedChildId,
  basePath = PARENT_ROUTES.dashboard,
}: ChildSwitcherProps) {
  const { t } = useTranslation(PARENT_NAMESPACE);

  // One child is not a choice, and a lone tab reads as a control that does
  // nothing. The name is already in the heading above it.
  if (profiles.length < 2) return null;

  return (
    <nav aria-label={t("dashboard.switcherLabel")}>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {profiles.map((child) => {
          const isSelected = child.id === selectedChildId;

          return (
            <li key={child.id}>
              <Link
                href={`${basePath}?child=${encodeURIComponent(child.id)}`}
                aria-current={isSelected ? "page" : undefined}
                className={cn(
                  // 44px minimum touch target on a parent surface (design.md §7).
                  "flex min-h-11 items-center gap-2 rounded-[var(--radius)] border px-3 py-2 font-medium text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isSelected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground text-xs uppercase"
                >
                  {[...child.firstName][0] ?? "?"}
                </span>
                <span className="whitespace-nowrap">{child.firstName}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
