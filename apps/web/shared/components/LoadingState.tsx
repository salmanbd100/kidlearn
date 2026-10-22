import { cn, Spinner } from "@kidlearn/ui";

export function LoadingState({
  label,
  isLabelVisible = false,
  className,
}: {
  label: string;
  /** For a wait long enough to need explaining, such as the API waking from its free-tier sleep. */
  isLabelVisible?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12",
        className,
      )}
    >
      {isLabelVisible ? (
        <>
          <Spinner size="lg" tone="muted" />
          <p role="status" className="text-muted-foreground text-sm">
            {label}
          </p>
        </>
      ) : (
        <Spinner size="lg" tone="muted" label={label} />
      )}
    </div>
  );
}
