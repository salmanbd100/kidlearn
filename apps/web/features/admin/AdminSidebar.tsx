import { cn } from "@kidlearn/ui";
import Link from "next/link";
import { ADMIN_NAV, activeAdminNavHref } from "@/features/admin/admin-routes";

export interface AdminSidebarProps {
  pathname: string;
  /** Counts keyed by href; zero or missing renders nothing. */
  badges?: Partial<Record<string, number>>;
  footer?: React.ReactNode;
}

export function AdminSidebar({ pathname, badges, footer }: AdminSidebarProps) {
  const activeHref = activeAdminNavHref(pathname);

  return (
    <nav
      aria-label="Admin sections"
      // No `h-dvh`: a second viewport-sized box inside the flex row made the page scroll.
      className="flex shrink-0 flex-col gap-4 border-border border-b bg-card p-3 md:w-56 md:border-r md:border-b-0 md:p-4"
    >
      <p className="px-2 font-semibold text-muted-foreground text-xs uppercase tracking-[0.08em]">
        kidlearn CMS
      </p>

      {/* Scrolls itself on a short window so the footer stays reachable. */}
      <ul className="-mx-1 flex min-h-0 flex-1 gap-1 overflow-x-auto px-1 md:flex-col md:overflow-y-auto">
        {ADMIN_NAV.map(({ href, label }) => {
          const isActive = href === activeHref;
          const count = badges?.[href] ?? 0;
          return (
            <li key={href} className="shrink-0 md:shrink">
              <Link
                href={href}
                // `aria-current`, not colour alone (design.md §2.3).
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  // 44px minimum on a non-kid surface (design.md §7).
                  "flex min-h-11 items-center rounded-(--radius) px-3 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span className="flex-1">{label}</span>
                {count > 0 ? (
                  <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 font-medium text-[11px] text-primary-foreground">
                    {/* Glyph hidden and the count announced in a sentence; sr-only sibling because a bare `span` has no role for `aria-label`. */}
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
