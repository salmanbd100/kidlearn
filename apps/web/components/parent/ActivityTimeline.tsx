"use client";

import type {
  DashboardActivityItem,
  DashboardActivityType,
} from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { Award, BookOpen, BookText, Sprout } from "lucide-react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import { pickLabel } from "@/lib/localized-label";
import { formatAbsolute, formatRelative } from "@/lib/relative-time";

/** What this child has finished lately (FR-DASH-04). */
const ACTIVITY_ICONS: Record<
  DashboardActivityType,
  ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  lesson_completed: BookOpen,
  story_completed: BookText,
  badge_earned: Award,
};

const ACTIVITY_LABEL_KEYS: Record<DashboardActivityType, string> = {
  lesson_completed: "dashboard.activityLesson",
  story_completed: "dashboard.activityStory",
  badge_earned: "dashboard.activityBadge",
};

const iconVariants = cva(
  "flex size-9 shrink-0 items-center justify-center rounded-full",
  {
    variants: {
      type: {
        lesson_completed: "bg-primary/10 text-primary",
        story_completed: "bg-secondary text-secondary-foreground",
        badge_earned: "bg-accent text-accent-foreground",
      },
    },
  },
);

export interface ActivityTimelineProps {
  items: readonly DashboardActivityItem[];
  /** The child whose feed this is — the empty state says their name. */
  childName: string;
  now: Date;
}

export function ActivityTimeline({
  items,
  childName,
  now,
}: ActivityTimelineProps) {
  const { t, i18n } = useTranslation(PARENT_NAMESPACE);

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius)] border border-border bg-card p-4 sm:p-5">
      <h2 className="font-semibold text-card-foreground text-lg">
        {t("dashboard.activityTitle")}
      </h2>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          {/* Lucide, not an emoji: the three feed icons below are Lucide, and an
              emoji ignores `currentColor` and redraws itself per OS
              (design.md §9 — never mix icon families on one surface). */}
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <Sprout className="size-6" />
          </span>
          <p className="text-muted-foreground text-sm">
            {t("dashboard.activityEmpty", { name: childName })}
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item) => {
            const Icon = ACTIVITY_ICONS[item.type];
            const occurredAt = new Date(item.occurredAt);

            return (
              <li
                key={`${item.type}:${item.refId}:${item.occurredAt}`}
                className="flex items-center gap-3"
              >
                <span className={cn(iconVariants({ type: item.type }))}>
                  <Icon aria-hidden className="size-4" />
                </span>

                <div className="flex min-w-0 flex-1 flex-col">
                  {/* Wrapped to two lines, not truncated: a Bangla title gets
                      ~180px beside the icon and the date on a 360px phone, and
                      this is the content the parent came to read
                      (design.md §1 — never truncate meaning). */}
                  <p className="line-clamp-2 font-medium text-card-foreground text-sm">
                    {pickLabel(item.title, i18n.language)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t(ACTIVITY_LABEL_KEYS[item.type])}
                  </p>
                </div>

                <time
                  dateTime={item.occurredAt}
                  title={formatAbsolute(occurredAt, i18n.language)}
                  className="shrink-0 text-muted-foreground text-xs"
                >
                  {formatRelative(occurredAt, i18n.language, now)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
