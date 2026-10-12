import type { ReactNode } from "react";

export interface AdminPageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Sits above the title — a back link on a detail page. */
  eyebrow?: ReactNode;
  actions?: ReactNode;
}

export function AdminPageHeader({
  title,
  description,
  eyebrow,
  actions,
}: AdminPageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-border border-b pb-5">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow}
        <h1 className="font-semibold text-2xl text-foreground tracking-tight">
          {title}
        </h1>
        {description === undefined ? null : (
          <p className="max-w-prose text-muted-foreground text-sm">
            {description}
          </p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
