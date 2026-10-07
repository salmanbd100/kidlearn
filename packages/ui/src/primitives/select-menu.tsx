"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown } from "lucide-react";
import type * as React from "react";
import { cn } from "../lib/cn";
import { usePortalContainer } from "./theme-scope";

/**
 * A styled listbox for when the platform `<select>` popup is too blunt (the CMS). `Select` stays
 * the default: it is native on a phone, and this one is not.
 */
function SelectMenu(props: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root {...props} />;
}

const selectMenuTriggerVariants = cva(
  // 44px tall on every size: a trigger is a parent-surface tap target (design.md §7).
  "flex h-11 w-full items-center justify-between gap-2 rounded-(--radius) border border-input bg-card px-3 text-left text-foreground shadow-xs transition-colors hover:border-ring/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground aria-[invalid=true]:border-destructive [&>span]:truncate",
  {
    variants: {
      size: {
        default: "text-base",
        sm: "text-sm",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export interface SelectMenuTriggerProps
  extends React.ComponentProps<typeof SelectPrimitive.Trigger>,
    VariantProps<typeof selectMenuTriggerVariants> {
  placeholder?: string;
}

function SelectMenuTrigger({
  className,
  size,
  placeholder,
  ...props
}: SelectMenuTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      className={cn(selectMenuTriggerVariants({ size }), className)}
      {...props}
    >
      <SelectPrimitive.Value placeholder={placeholder} />
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectMenuContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const container = usePortalContainer();
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={6}
        className={cn(
          // `var(--radius)`, not a fixed step, for the reason given in `dialog.tsx`.
          "z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-(--radius) border border-border bg-card text-card-foreground shadow-lg",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectMenuItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        // 44px tall: a listbox row is a parent-surface tap target (design.md §7).
        "relative flex h-11 cursor-pointer select-none items-center gap-2 rounded-sm pr-9 pl-3 text-sm outline-none touch-manipulation data-disabled:pointer-events-none data-highlighted:bg-muted data-[state=checked]:font-medium data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-3 flex items-center text-primary">
        <Check aria-hidden="true" className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuSeparator,
  SelectMenuTrigger,
  selectMenuTriggerVariants,
};
