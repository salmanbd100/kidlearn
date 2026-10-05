"use client";

import { PARENT_NAMESPACE } from "@kidlearn/i18n";
import {
  Button,
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
import {
  isOnboardingPath,
  isPublicParentPath,
  PARENT_ROUTES,
} from "@/features/parent/parent-redirect";
import { STUDENT_ROUTES } from "@/features/student/student-routes";
import { signOut } from "@/shared/api/api-client";
import { LanguageSwitch } from "@/shared/components/LanguageSwitch";
import { ParentAvatar } from "@/shared/components/ParentAvatar";

const NAV_ITEMS = [
  { href: PARENT_ROUTES.dashboard, labelKey: "nav.dashboard" },
  { href: PARENT_ROUTES.children, labelKey: "nav.children" },
  { href: PARENT_ROUTES.reports, labelKey: "nav.reports" },
] as const;

const navLinkVariants = cva(
  "inline-flex h-11 shrink-0 items-center rounded-(--radius) px-3 font-medium text-sm transition-colors touch-manipulation focus-ring",
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

  // Onboarding stays bare: nothing to navigate to, and sign-out mid-consent is a dead end.
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

    // A failure leaves the cookie live; navigating anyway would bounce off `resolveParentRedirect`
    // back to the dashboard and the parent would think they had signed out.
    if (!(await signOut())) {
      setHasSignOutFailed(true);
      return;
    }

    // Clear the provider first: it still holds the signed-in parent, and the resolver would bounce the redirect back.
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

      {/* Full-width second row on a phone, inline from `sm`; `order-last` keeps the avatar beside the wordmark. */}
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
        {/* On the bar, not in the account menu: two taps deep behind an avatar, nobody found it. */}
        <Button asChild size="default">
          <Link href={STUDENT_ROUTES.selectProfile}>
            <Baby aria-hidden="true" />
            {/* Below `sm` only the icon shows, so a third labelled pill doesn't wrap the row. */}
            <span className="max-sm:sr-only">{t("nav.backToKidMode")}</span>
          </Link>
        </Button>

        <LanguageSwitch size="default" />

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("nav.menuLabel")}
            className="inline-flex h-11 items-center gap-1 rounded-pill pr-2 pl-1 text-muted-foreground transition-colors touch-manipulation hover:text-foreground focus-ring"
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
