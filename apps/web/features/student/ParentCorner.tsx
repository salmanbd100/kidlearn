"use client";

import { STUDENT_NAMESPACE } from "@kidlearn/i18n";
import { cva } from "class-variance-authority";
import { Lock } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useActiveChild } from "@/features/children/active-child";
import { STUDENT_ROUTES } from "@/features/student/student-routes";
import { ParentAvatar } from "@/shared/components/ParentAvatar";

const PARENT_DESTINATION = "/parent/children";

/** The lesson player and story reader have their own 64px exit X and toggle in the top-right corner; the lock would take those taps, so those screens hide it. */
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

export function ParentCorner() {
  const { t } = useTranslation(STUDENT_NAMESPACE);
  const router = useRouter();
  const pathname = usePathname();
  const { parent } = useActiveChild();

  /** Named on `/select-profile` (no child playing yet), anonymous elsewhere: a photo of their parent is the most tappable thing on a child's screen. With no PIN behind this door, that dullness is all that discourages the tap. */
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
          {/* Truncated, not wrapped: the chip must stay one 44px row against a long Google display name. */}
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
