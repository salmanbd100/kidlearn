import { ArrowRight, Sparkles } from "lucide-react";
import { Fragment } from "react";

const STAGES: { title: string; body: string; isHuman: boolean }[] = [
  {
    title: "Generate",
    body: "A button sends a request to Gemini.",
    isHuman: false,
  },
  {
    title: "Draft + job",
    body: "The result is saved as a draft and an AI job awaiting review.",
    isHuman: false,
  },
  {
    title: "AI Queue",
    body: "An admin reads the text, listens to audio, looks at images.",
    isHuman: true,
  },
  {
    title: "Approve and publish",
    body: "Approving publishes it — children see it at once. Edit first, or reject with a reason.",
    isHuman: true,
  },
];

const BUTTONS: { name: string; where: string; makes: string }[] = [
  {
    name: "Generate lesson",
    where: "Curriculum header",
    makes:
      "A lesson — titles, scripts, objectives — and its quiz, from one line describing what to teach.",
  },
  {
    name: "Generate questions with AI",
    where: "Selected lesson",
    makes:
      "Four quiz questions in both languages, creating the quiz if needed.",
  },
  {
    name: "Generate narration",
    where: "Selected lesson, quiz page",
    makes:
      "Spoken audio clips through Google Text-to-Speech — a separate key from Gemini.",
  },
];

export function AiFlow() {
  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        {STAGES.map((stage, index) => (
          <Fragment key={stage.title}>
            <li className="flex-1">
              <div className="flex h-full flex-col gap-1 rounded-(--radius) border border-border bg-card p-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground text-sm">
                    {stage.title}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {stage.isHuman ? "You" : "Automatic"}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs">
                  {stage.body}
                </span>
              </div>
            </li>
            {index < STAGES.length - 1 ? (
              <li
                aria-hidden="true"
                className="flex items-center justify-center text-muted-foreground"
              >
                <ArrowRight className="size-4 rotate-90 lg:rotate-0" />
              </li>
            ) : null}
          </Fragment>
        ))}
      </ol>

      <ul className="grid gap-3 md:grid-cols-3">
        {BUTTONS.map((button) => (
          <li
            key={button.name}
            className="flex flex-col gap-2 rounded-(--radius) border border-border bg-card p-4"
          >
            <span className="flex items-center gap-2 font-medium text-foreground text-sm">
              <Sparkles aria-hidden="true" className="size-4 text-primary" />
              {button.name}
            </span>
            <span className="text-muted-foreground text-xs">
              {button.where}
            </span>
            <span className="text-foreground text-sm">{button.makes}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
