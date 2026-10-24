export interface GuideStep {
  title: string;
  body: string;
}

export function GuideSteps({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, index) => (
        <li key={step.title}>
          <div className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs">
              {index + 1}
            </span>
            <span className="flex flex-col gap-0.5 pt-0.5">
              <span className="font-medium text-foreground text-sm">
                {step.title}
              </span>
              <span className="max-w-prose text-muted-foreground text-sm">
                {step.body}
              </span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
