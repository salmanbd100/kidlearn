"use client";

import type { ParentSummaryResponse } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import Image from "next/image";
import { useState } from "react";

// The grown-up's face, wherever a surface needs to show whose device this is.

const parentAvatarVariants = cva(
  "relative flex shrink-0 items-center justify-center overflow-hidden rounded-pill bg-muted font-semibold text-muted-foreground",
  {
    variants: {
      size: {
        sm: "size-8 text-xs",
        default: "size-10 text-sm",
      },
    },
    defaultVariants: { size: "default" },
  },
);

/** Pixel width requested of `next/image`, per `size`. Doubled for retina. */
const RENDERED_PX = { sm: 64, default: 80 } as const;

export interface ParentAvatarProps
  extends VariantProps<typeof parentAvatarVariants> {
  parent: ParentSummaryResponse;
  className?: string;
}

/**
 * Initials for a parent Google gave no photo. Falls back to the email, which is
 * the one field that is never null.
 */
export function parentInitials(parent: ParentSummaryResponse): string {
  const words = parent.name?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (words.length === 0) return parent.email.slice(0, 1).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();

  return `${words[0].slice(0, 1)}${words[words.length - 1].slice(0, 1)}`.toUpperCase();
}

export function ParentAvatar({ parent, size, className }: ParentAvatarProps) {
  // Google's CDN 404s a photo the account has since removed, and a broken image
  // icon next to a name reads as an error rather than as "no photo set".
  const [hasImageFailed, setHasImageFailed] = useState(false);

  const src = hasImageFailed || !parent.avatarUrl ? null : parent.avatarUrl;

  return (
    <span
      aria-hidden="true"
      className={cn(parentAvatarVariants({ size }), className)}
    >
      {src === null ? (
        parentInitials(parent)
      ) : (
        <Image
          src={src}
          alt=""
          width={RENDERED_PX[size ?? "default"]}
          height={RENDERED_PX[size ?? "default"]}
          className="size-full object-cover"
          onError={() => setHasImageFailed(true)}
        />
      )}
    </span>
  );
}
