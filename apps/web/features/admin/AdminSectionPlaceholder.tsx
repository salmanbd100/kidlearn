/**
 * A CMS section that has its route but not yet its content (FR-CMS-01 shell).
 */
export interface AdminSectionPlaceholderProps {
  title: string;
  /** Implementation file number(s), e.g. `"32"` or `"34–37"`. */
  arrivesIn: string;
}

export function AdminSectionPlaceholder({
  title,
  arrivesIn,
}: AdminSectionPlaceholderProps) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-semibold text-foreground text-xl">{title}</h1>
      <p className="text-muted-foreground text-sm">
        Coming in file {arrivesIn}.
      </p>
    </div>
  );
}
