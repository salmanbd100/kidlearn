"use client";

import type { ParentSummaryResponse } from "@kidlearn/types";
import { cn } from "@kidlearn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import Image from "next/image";
import { useState } from "react";

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

const RENDERED_PX = { sm: 64, default: 80 } as const;

export interface ParentAvatarProps
  extends VariantProps<typeof parentAvatarVariants> {
  parent: ParentSummaryResponse;
  className?: string;
}

/** Falls back to the email, the one field never null. */
export function parentInitials(parent: ParentSummaryResponse): string {
  const words = parent.name?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (words.length === 0) return parent.email.slice(0, 1).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();

  return `${words[0].slice(0, 1)}${words[words.length - 1].slice(0, 1)}`.toUpperCase();
}

export function ParentAvatar({ parent, size, className }: ParentAvatarProps) {
  // A photo the account has since removed 404s; a broken-image icon reads as an error, not "no photo set".
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
