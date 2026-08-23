/**
 * A CMS section that has its route but not yet its content (FR-CMS-01 shell).
 *
 * These pages exist so the sidebar never 404s, which is what lets files 32–37
 * replace *content* rather than routing — a section that arrives with its own new
 * route is a change to the nav, the guard and the layout at the same time.
 *
 * `arrivesIn` names the implementation file rather than a date, so a reader can go
 * straight to the spec that owns the section.
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
