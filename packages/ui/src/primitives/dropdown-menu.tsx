"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cva } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/cn";

// DropdownMenu — the shadcn/Radix primitive, tokenized for both themes.

function DropdownMenu(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>,
) {
  return <DropdownMenuPrimitive.Root {...props} />;
}

function DropdownMenuTrigger(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
) {
  return <DropdownMenuPrimitive.Trigger {...props} />;
}

const dropdownMenuContentVariants = cva(
  // `var(--radius)` rather than a fixed step, for the reason `dialog.tsx`
  // spells out: only `--radius` is redefined per theme.
  "z-50 min-w-56 overflow-hidden rounded-[var(--radius)] border border-border bg-card p-1 text-card-foreground shadow-lg",
);

function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(dropdownMenuContentVariants(), className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        // 44px tall: a menu row is a parent-surface tap target (design.md §7).
        "flex h-11 cursor-pointer select-none items-center gap-2 rounded-sm px-3 text-sm outline-none [touch-action:manipulation] focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A non-interactive row — an identity block, a section heading. Radix skips it
 * in keyboard navigation, which is what makes it safe to put a name and email
 * at the top of a menu.
 */
function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn("flex flex-col gap-0.5 px-3 py-2", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  dropdownMenuContentVariants,
};
