import { cn } from "@kidlearn/ui";
import { cva } from "class-variance-authority";
import {
  CircleCheck,
  Info,
  type LucideIcon,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";

type CalloutTone = "info" | "warning" | "success";

const calloutVariants = cva(
  "flex gap-3 rounded-(--radius) border p-4 text-foreground text-sm",
  {
    variants: {
      tone: {
        info: "border-primary/30 bg-primary/5",
        warning: "border-warning/50 bg-warning/10",
        success: "border-success/40 bg-success/10",
      },
    },
  },
);

const iconVariants = cva("mt-0.5 size-4 shrink-0", {
  variants: {
    tone: {
      info: "text-primary",
      warning: "text-warning",
      success: "text-success",
    },
  },
});

const ICON_BY_TONE: Record<CalloutTone, LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  success: CircleCheck,
};

export function GuideCallout({
  tone,
  title,
  children,
}: {
  tone: CalloutTone;
  title: string;
  children: ReactNode;
}) {
  const Icon = ICON_BY_TONE[tone];

  return (
    <div className={calloutVariants({ tone })}>
      <Icon aria-hidden="true" className={cn(iconVariants({ tone }))} />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold">{title}</p>
        <div className="flex flex-col gap-1.5 text-muted-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}
