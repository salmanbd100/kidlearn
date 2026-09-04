"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import type * as React from "react";
import { cn } from "../lib/cn";

// Dialog — the shadcn/Radix primitive, tokenized for both themes.

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogTrigger(
  props: React.ComponentProps<typeof DialogPrimitive.Trigger>,
) {
  return <DialogPrimitive.Trigger {...props} />;
}

function DialogClose(
  props: React.ComponentProps<typeof DialogPrimitive.Close>,
) {
  return <DialogPrimitive.Close {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      // Deliberately unanimated. `tailwindcss-animate` is not a dependency here,
      // and design.md §1.4 asks that motion answer "what just happened?" — a
      // scrim fade does not, and a hand-rolled keyframe would be the one piece of
      // motion in the system that no reduced-motion query covers.
      className={cn("fixed inset-0 z-50 bg-foreground/50", className)}
      {...props}
    />
  );
}

const dialogContentVariants = cva(
  // `var(--radius)`, not `rounded-xl`: the `--radius-*` scale `tokens.css`
  // declares in `@theme` is static, so `rounded-xl` would pin every dialog to the
  // 28px kid-panel radius on both surfaces. Only `--radius` is redefined per
  // theme (design.md §4.2), so this is what actually follows `[data-theme]` —
  // 20px on the kid surface, 12px on the parent one.
  "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[var(--radius)] bg-card p-6 text-card-foreground shadow-lg",
  {
    variants: {
      size: {
        default: "max-w-lg",
        sm: "max-w-sm",
        lg: "max-w-2xl",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {
  /**
   * When false the dialog has no close button and ignores Escape and outside
   * clicks — for a dialog that is itself a gate. Defaults to true.
   */
  isDismissable?: boolean;
  /** Accessible name for the close button. Required whenever one is rendered. */
  closeLabel?: string;
}

function DialogContent({
  className,
  size,
  children,
  isDismissable = true,
  closeLabel,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(dialogContentVariants({ size }), className)}
        onEscapeKeyDown={(event) => {
          if (!isDismissable) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (!isDismissable) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (!isDismissable) event.preventDefault();
        }}
        {...props}
      >
        {children}
        {isDismissable ? (
          <DialogPrimitive.Close
            // 44px, so the parent surface's minimum target holds (design.md §7).
            className="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={closeLabel}
          >
            <X aria-hidden="true" className="size-5" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/**
 * `inset` reserves room for the close button so a long title cannot run under it.
 * `flush` is for a dialog rendered with `isDismissable={false}`, where there is no
 * button to clear and the reserved gutter would be dead space.
 */
const dialogHeaderVariants = cva("flex flex-col gap-1.5", {
  variants: {
    gutter: {
      inset: "pr-11",
      flush: "",
    },
  },
  defaultVariants: { gutter: "inset" },
});

export interface DialogHeaderProps
  extends React.ComponentProps<"header">,
    VariantProps<typeof dialogHeaderVariants> {}

function DialogHeader({ className, gutter, ...props }: DialogHeaderProps) {
  return (
    <header
      className={cn(dialogHeaderVariants({ gutter, className }))}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"footer">) {
  return (
    <footer
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("font-semibold text-lg leading-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
  DialogTrigger,
  dialogContentVariants,
  dialogHeaderVariants,
};
