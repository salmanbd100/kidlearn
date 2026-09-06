"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import { Baby, ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParentSession } from "@/app/(parent)/context/parent-session";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { ParentAvatar } from "@/components/ParentAvatar";
import { signOut } from "@/lib/api-client";
import { PARENT_NAMESPACE } from "@/lib/i18n";
import {
  isOnboardingPath,
  isPublicParentPath,
  PARENT_ROUTES,
} from "@/lib/parent-redirect";
import { STUDENT_ROUTES } from "@/lib/student-routes";

// The frame around every parent page once onboarding is behind them.

const NAV_ITEMS = [
  { href: PARENT_ROUTES.dashboard, labelKey: "nav.dashboard" },
  { href: PARENT_ROUTES.children, labelKey: "nav.children" },
  { href: PARENT_ROUTES.reports, labelKey: "nav.reports" },
] as const;

const navLinkVariants = cva(
  "inline-flex h-11 shrink-0 items-center rounded-[var(--radius)] px-3 font-medium text-sm transition-colors [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      isActive: {
        true: "bg-muted text-foreground",
        false: "text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: { isActive: false },
  },
);

export function ParentTopBar() {
  const { t } = useTranslation(PARENT_NAMESPACE);
  const { t: tCommon } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { status, parent, refresh } = useParentSession();
  const [hasSignOutFailed, setHasSignOutFailed] = useState(false);

  // Onboarding steps stay bare: a parent who has not set a PIN yet has nowhere
  // to navigate to, and a sign-out control mid-consent is a dead end.
  if (
    status !== "ready" ||
    parent === undefined ||
    isPublicParentPath(pathname) ||
    isOnboardingPath(pathname)
  ) {
    return null;
  }

  const handleSignOut = async () => {
    setHasSignOutFailed(false);

    // A failure here leaves the cookie live. Navigating anyway would bounce off
    // `resolveParentRedirect` — which reads a signed-in parent on the login page
    // as someone who has finished onboarding — straight back to the dashboard,
    // and the parent would be left believing they had signed out.
    if (!(await signOut())) {
      setHasSignOutFailed(true);
      return;
    }

    // Before navigating: the provider still holds the signed-in parent, and the
    // same resolver sends them away from the login page — so without clearing it
    // first, the redirect below bounces back to the dashboard for that reason
    // instead.
    await refresh();
    router.replace(PARENT_ROUTES.login);
  };

  return (
    <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-border border-b pb-3">
      <Link
        href={PARENT_ROUTES.dashboard}
        className="font-semibold text-foreground text-lg"
      >
        {tCommon("app.name")}
      </Link>

      {/* A full-width second row on a phone, inline from `sm` up. `order-last`
          is what keeps the avatar beside the wordmark at the narrow width. */}
      <nav
        aria-label={t("nav.label")}
        className="-mx-1 order-last flex w-full gap-1 overflow-x-auto px-1 sm:order-none sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0"
      >
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            className={navLinkVariants({ isActive: pathname === item.href })}
          >
            {t(item.labelKey)}
          </Link>
        ))}
      </nav>

      {hasSignOutFailed ? (
        <p role="alert" className="order-last w-full text-destructive text-sm">
          {t("nav.signOutFailed")}
        </p>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <LanguageSwitch size="default" />

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("nav.menuLabel")}
            className="inline-flex h-11 items-center gap-1 rounded-pill pr-2 pl-1 text-muted-foreground transition-colors [touch-action:manipulation] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ParentAvatar parent={parent} size="sm" />
            <ChevronDown aria-hidden="true" className="size-4" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <span className="truncate font-medium text-foreground text-sm">
                {parent.name ?? t("nav.fallbackName")}
              </span>
              <span className="truncate text-muted-foreground text-xs">
                {parent.email}
              </span>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link href={STUDENT_ROUTES.selectProfile}>
                <Baby aria-hidden="true" />
                {t("nav.backToKidMode")}
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={() => {
                void handleSignOut();
              }}
            >
              <LogOut aria-hidden="true" />
              {t("nav.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
