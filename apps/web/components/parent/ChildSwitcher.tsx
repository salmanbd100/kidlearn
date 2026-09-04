"use client";

import type { ChildProfileResponse } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { PARENT_ROUTES } from "@/lib/parent-redirect";

/** Which child's dashboard is showing (FR-DASH-01). */
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
