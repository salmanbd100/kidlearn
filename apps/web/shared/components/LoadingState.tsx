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
      <Spinner size="lg" tone="muted" />
      {/* One status element in both modes. Swapping it for another when the wait turns long would mount a live
          region with its text already inside, which many screen readers never announce. */}
      <p
        role="status"
        className={cn(
          "text-muted-foreground text-sm",
          !isLabelVisible && "sr-only",
        )}
      >
        {label}
      </p>
    </div>
  );
}
