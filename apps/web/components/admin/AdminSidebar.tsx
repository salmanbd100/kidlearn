import { cn } from "@kidlearn/ui";
import Link from "next/link";
import { ADMIN_NAV, activeAdminNavHref } from "@/lib/admin-routes";

/** The CMS navigation (FR-CMS-01 shell). */
export interface AdminSidebarProps {
  pathname: string;
  /**
   * Counts to show against nav items, keyed by href (file 37, requirement 8).
   * A zero or a missing entry renders nothing — a badge reading "0" is a
   * notification that there is nothing to notify about.
   */
  badges?: Partial<Record<string, number>>;
  /** Rendered at the foot of the rail — the signed-in admin and a way out. */
  footer?: React.ReactNode;
}

export function AdminSidebar({ pathname, badges, footer }: AdminSidebarProps) {
  const activeHref = activeAdminNavHref(pathname);

  return (
    <nav
      aria-label="Admin sections"
      className="flex shrink-0 flex-col gap-4 border-border border-b bg-card p-3 md:h-dvh md:w-56 md:border-r md:border-b-0 md:p-4"
    >
      <p className="px-2 font-semibold text-muted-foreground text-xs uppercase tracking-[0.08em]">
        kidlearn CMS
      </p>

      <ul className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 md:flex-col md:overflow-x-visible">
        {ADMIN_NAV.map(({ href, label }) => {
          const isActive = href === activeHref;
          const count = badges?.[href] ?? 0;
          return (
            <li key={href} className="shrink-0 md:shrink">
              <Link
                href={href}
                // `aria-current` rather than colour alone: the active item must be
                // announced, and meaning is never carried by colour on its own
                // (design.md §2.3).
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  // 44px minimum on a non-kid surface (design.md §7).
                  "flex min-h-11 items-center rounded-[var(--radius)] px-3 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span className="flex-1">{label}</span>
                {count > 0 ? (
                  <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 font-medium text-[11px] text-primary-foreground">
                    {/* The glyph is hidden and the same number is announced in a
                        sentence instead, so the link does not read as "AI Queue
                        3" with no clue what the 3 counts (design.md §2.3). A
                        visually-hidden sibling rather than `aria-label`, which a
                        bare `span` has no role to support. */}
                    <span aria-hidden="true">{count}</span>
                    <span className="sr-only">
                      {count} {count === 1 ? "job" : "jobs"} awaiting review
                    </span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      {footer === undefined ? null : (
        <div className="border-border border-t pt-3 md:pt-4">{footer}</div>
      )}
    </nav>
  );
}
