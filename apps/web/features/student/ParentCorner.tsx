"use client";

import { cva } from "class-variance-authority";
import { Lock } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useActiveChild } from "@/features/children/active-child";
import { STUDENT_ROUTES } from "@/features/student/student-routes";
import { ParentAvatar } from "@/shared/components/ParentAvatar";
import { STUDENT_NAMESPACE } from "@/shared/lib/i18n";

/** Where the parent area opens. */
const PARENT_DESTINATION = "/parent/children";

/**
 * The lesson player and the story reader fill the screen with a header of their
 * own, whose 64px exit X and auto-advance toggle sit in the same top-right
 * corner. The lock, on top by z-order, took the taps a child aimed at them —
 * and with no PIN behind it, a stray tap landed in the parent area. Both
 * screens have their own way out, back to one that shows the lock.
 */
function isFullScreenPlayer(pathname: string): boolean {
  return pathname.startsWith("/lesson/") || /^\/stories\/[^/]+$/.test(pathname);
}

const parentCornerVariants = cva(
  // Small and quiet by design, but still a legal target for the adult hand that
  // needs it (44px, design.md §7 — this is a parent control).
  "absolute top-2 right-2 z-10 inline-flex h-11 items-center rounded-pill text-muted-foreground transition-colors touch-manipulation hover:text-foreground focus-ring",
  {
    variants: {
      appearance: {
        chip: "max-w-[45vw] gap-2 bg-card pr-4 pl-1.5 shadow-sm",
        lock: "w-11 justify-center",
      },
    },
    defaultVariants: { appearance: "lock" },
  },
);

/** The only way out of the Student Portal (Pillar C). */
export function ParentCorner() {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const pathname = usePathname();
  const { parent } = useActiveChild();

  /**
   * Named on the hand-off screen, anonymous everywhere else. `/select-profile`
   * is the one place no child is playing yet, so a grown-up looking for the way
   * out can be shown it; on a screen a child is *using*, a photo of their parent
   * is the most tappable thing on the page, and this exit should stay dull.
   *
   * That dullness is now the only thing discouraging the tap: there is no PIN
   * behind this door, so a child who finds it is in the parent area.
   */
  const isNamed =
    pathname === STUDENT_ROUTES.selectProfile && parent !== undefined;

  if (isFullScreenPlayer(pathname)) return null;

  return (
    <button
      type="button"
      className={parentCornerVariants({
        appearance: isNamed ? "chip" : "lock",
      })}
      aria-label={t("parentCorner.label")}
      onClick={() => {
        router.push(PARENT_DESTINATION);
      }}
    >
      {isNamed && parent !== undefined ? (
        <>
          <ParentAvatar parent={parent} size="sm" />
          {/* Truncated rather than wrapped: the chip must stay one 44px row,
              and a long Google display name would otherwise push the layout. */}
          <span className="truncate font-body text-base">
            {parent.name ?? t("parentCorner.chipFallback")}
          </span>
        </>
      ) : (
        <Lock aria-hidden="true" className="size-5" />
      )}
    </button>
  );
}
