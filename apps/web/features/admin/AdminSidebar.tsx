import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import {
  Award,
  BookOpen,
  ChartColumn,
  GraduationCap,
  Image,
  type LucideIcon,
  Shapes,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {
  ADMIN_NAV,
  ADMIN_NAV_GROUP_LABELS,
  ADMIN_ROUTES,
  type AdminNavGroup,
  type AdminNavItem,
  activeAdminNavHref,
} from "@/features/admin/admin-routes";

export interface AdminSidebarProps {
  pathname: string;
  /** Counts keyed by href; zero or missing renders nothing. */
  badges?: Partial<Record<string, number>>;
  footer?: React.ReactNode;
}

const ICON_BY_HREF: Record<string, LucideIcon> = {
  [ADMIN_ROUTES.curriculum]: GraduationCap,
  [ADMIN_ROUTES.stories]: BookOpen,
  [ADMIN_ROUTES.media]: Image,
  [ADMIN_ROUTES.badges]: Award,
  [ADMIN_ROUTES.aiQueue]: Sparkles,
  [ADMIN_ROUTES.analytics]: ChartColumn,
};

const navLinkVariants = cva(
  cn(
    // 44px minimum on a non-kid surface (design.md §7).
    "group flex min-h-11 items-center gap-3 rounded-(--radius) px-3 text-sm transition-colors",
    "focus-ring",
  ),
  {
    variants: {
      isActive: {
        true: "bg-primary/10 font-medium text-primary",
        false:
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      },
    },
    defaultVariants: { isActive: false },
  },
);

export function AdminSidebar({ pathname, badges, footer }: AdminSidebarProps) {
  const activeHref = activeAdminNavHref(pathname);
  const groups = groupNav(ADMIN_NAV);

  return (
    <nav
      aria-label="Admin sections"
      // No `h-dvh`: a second viewport-sized box inside the flex row made the page scroll.
      className="flex shrink-0 flex-col gap-3 border-border border-b bg-card p-3 md:w-60 md:gap-6 md:border-r md:border-b-0 md:p-4"
    >
      <div className="flex items-center gap-2.5 px-1">
        <span className="flex size-8 items-center justify-center rounded-(--radius) bg-primary text-primary-foreground">
          <Shapes aria-hidden="true" className="size-4" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="font-semibold text-foreground text-sm">
            kidlearn
          </span>
          <span className="text-muted-foreground text-xs">Content studio</span>
        </span>
      </div>

      {/* Scrolls itself on a short window so the footer stays reachable; a single row below `md`. */}
      <div className="-mx-1 flex min-h-0 flex-1 gap-1 overflow-x-auto px-1 md:flex-col md:gap-5 md:overflow-y-auto">
        {groups.map(({ group, items }) => (
          <div key={group} className="flex shrink-0 flex-col gap-1 md:shrink">
            <p
              // Off the phone row, where headings would break it into pieces.
              className="hidden px-3 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.08em] md:block"
            >
              {ADMIN_NAV_GROUP_LABELS[group]}
            </p>
            <ul className="flex gap-1 md:flex-col">
              {items.map(({ href, label }) => {
                const isActive = href === activeHref;
                const count = badges?.[href] ?? 0;
                const Icon = ICON_BY_HREF[href];
                return (
                  <li key={href} className="shrink-0 md:shrink">
                    <Link
                      href={href}
                      // `aria-current`, not colour alone (design.md §2.3).
                      aria-current={isActive ? "page" : undefined}
                      className={navLinkVariants({ isActive })}
                    >
                      {Icon === undefined ? null : (
                        <Icon
                          aria-hidden="true"
                          className={cn(
                            "size-4 shrink-0",
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-accent-foreground",
                          )}
                        />
                      )}
                      <span className="flex-1 whitespace-nowrap">{label}</span>
                      {count > 0 ? (
                        <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 font-medium text-[11px] text-primary-foreground tabular-nums">
                          {/* Glyph hidden and the count announced in a sentence; sr-only sibling because a bare `span` has no role for `aria-label`. */}
                          <span aria-hidden="true">{count}</span>
                          <span className="sr-only">
                            {count} {count === 1 ? "job" : "jobs"} awaiting
                            review
                          </span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {footer === undefined ? null : (
        <div className="border-border border-t pt-3 md:pt-4">{footer}</div>
      )}
    </nav>
  );
}

function groupNav(
  items: readonly AdminNavItem[],
): Array<{ group: AdminNavGroup; items: AdminNavItem[] }> {
  const groups: Array<{ group: AdminNavGroup; items: AdminNavItem[] }> = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last?.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}
