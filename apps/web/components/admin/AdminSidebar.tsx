import { cn } from "@kidlearn/ui";
import Link from "next/link";
import { ADMIN_NAV, activeAdminNavHref } from "@/lib/admin-routes";

/**
 * The CMS navigation (FR-CMS-01 shell).
 *
 * Deliberately **plain**: no kid tokens, no display font, no mascot, no oversized
 * buttons. This is an internal tool used on a laptop by someone approving lessons,
 * and dressing it in the Student Portal's voice would make a dense content list
 * harder to scan, not friendlier (design.md §1, principle 5).
 *
 * Desktop-first, which is the one place this surface departs from the project's
 * mobile-first default (design.md §0): a fixed rail on ≥768px, a horizontal
 * scrolling bar below it. Admins use laptops — the small-screen treatment exists so
 * a phone is not broken, not so a CMS is comfortable on one.
 *
 * `pathname` is a prop rather than a `usePathname()` call so the six-section
 * contract is assertable without a router. It does not keep this a Server
 * Component — `AdminShell` is `'use client'`, so importing this from there puts it
 * in the client bundle either way.
 */
export interface AdminSidebarProps {
  pathname: string;
  /** Rendered at the foot of the rail — the signed-in admin and a way out. */
  footer?: React.ReactNode;
}

export function AdminSidebar({ pathname, footer }: AdminSidebarProps) {
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
                {label}
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
