import { Check, Image, Mic, Video } from "lucide-react";
import { CopyBlock } from "./CopyBlock";
import { GuideCallout } from "./GuideCallout";

const COMPARISON: { task: string; withGemini: string; without: string }[] = [
  {
    task: "Lesson text",
    withGemini: "Generate lesson writes titles and scripts",
    without: "Type or paste into the lesson form",
  },
  {
    task: "Quiz questions",
    withGemini: "Generate questions with AI",
    without: "Create quiz → Add question, one at a time",
  },
  {
    task: "Review",
    withGemini: "Required in the AI Queue before publishing",
    without: "You are the reviewer — the AI Queue never sees it",
  },
  {
    task: "Publishing",
    withGemini:
      "Approve and publish in the AI Queue — it goes live on approval",
    without: "Submit for review → Approve & publish on each editor",
  },
];

const STEPS: { title: string; body: string }[] = [
  {
    title: "Ask your tool for the CMS's shape",
    body: "ChatGPT, Claude, a teacher's worksheet, a textbook you have rights to — anything. The prompt below maps straight onto the forms.",
  },
  {
    title: "Read it as a reviewer would",
    body: "Check the facts, check every sentence suits a 3–6-year-old, and have a fluent speaker read the Bangla.",
  },
  {
    title: "Supply the media yourself",
    body: "Pictures and audio go through Media → Upload first. A question will not save without its prompt audio in both languages, nor a picture question without a picture on every option. See the table below.",
  },
  {
    title: "Paste it into the forms",
    body: "In the order of “Build a lesson by hand”: the lesson fields, then each quiz question through Add question, picking the media you uploaded.",
  },
  {
    title: "Preview, then publish",
    body: "The activity, the quiz, then the lesson — Submit for review → Approve & publish.",
  },
];

const PROMPT = `Write a lesson for children aged 4–5 (KG-1) teaching: <the letter A and the /a/ sound>.
Give me, in both English and Bangla:
- A child-facing title, at most 5 words.
- An intro script the mascot says: 2–4 short sentences, at most 8 words each.
Then 4 quiz questions. For each: the prompt, 3 answer options, and which is correct.
Use only words a 4-year-old knows. No idioms. Bangla must be natural, not word-for-word.
Finally list the concepts introduced as letter:X, word:Y, number:Z.`;

const MEDIA = [
  {
    icon: Image,
    need: "Pictures for options, targets and puzzles",
    how: "Draw, commission, or use a licence-cleared image. Media → Upload, kind image.",
  },
  {
    icon: Mic,
    need: "Prompt and instruction audio — required in both languages",
    how: "Record each prompt (a phone voice memo is fine, as m4a or mp3), upload it as audio, and pick it in the editor for the right language. Generate narration uses Google Text-to-Speech, not Gemini, but it only voices the lesson intro and its clip must be approved in the AI Queue before the lesson can publish.",
  },
  {
    icon: Video,
    need: "Lesson video",
    how: "Already made outside the CMS — nothing changes.",
  },
];

const ENDPOINTS: [string, string][] = [
  [
    "Create a world, subject, topic or lesson",
    "POST /api/admin/content/{worlds|subjects|topics|lessons}",
  ],
  ["Create a quiz", "POST /api/admin/content/quizzes"],
  ["Add a question", "POST /api/admin/content/quizzes/{quizId}/questions"],
  ["Create an activity", "POST /api/admin/content/activities"],
  [
    "Move through the workflow",
    'POST /api/admin/content/{resource}/{id}/transition  {"to": "in_review"}',
  ],
];

export function WithoutGemini() {
  return (
    <div className="flex flex-col gap-6">
      <GuideCallout
        tone="success"
        title="Nothing in publishing depends on Gemini."
      >
        <p>
          The AI buttons are shortcuts. Every field they fill can be typed in by
          hand, and content you enter yourself carries no AI job — so the AI
          review gate does not apply to it. If the subscription lapses or the
          quota runs out, only those buttons fail.
        </p>
      </GuideCallout>

      <div className="overflow-x-auto rounded-(--radius) border border-border">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium text-foreground">
                Task
              </th>
              <th scope="col" className="px-3 py-2 font-medium text-foreground">
                With Gemini
              </th>
              <th scope="col" className="px-3 py-2 font-medium text-foreground">
                Without Gemini
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row) => (
              <tr key={row.task} className="border-border border-t">
                <th
                  scope="row"
                  className="px-3 py-2 align-top font-medium text-foreground"
                >
                  {row.task}
                </th>
                <td className="px-3 py-2 align-top text-muted-foreground">
                  {row.withGemini}
                </td>
                <td className="px-3 py-2 align-top text-foreground">
                  <span className="flex gap-2">
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-success"
                    />
                    {row.without}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-semibold text-base text-foreground">
          Using content written elsewhere
        </h3>
        <ol className="flex flex-col gap-3">
          {STEPS.map((step, index) => (
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
      </div>

      <CopyBlock label="Prompt for an external AI tool" text={PROMPT} />

      <ul className="grid gap-3 md:grid-cols-3">
        {MEDIA.map((item) => (
          <li
            key={item.need}
            className="flex flex-col gap-2 rounded-(--radius) border border-border bg-card p-4"
          >
            <item.icon aria-hidden="true" className="size-5 text-primary" />
            <span className="font-medium text-foreground text-sm">
              {item.need}
            </span>
            <span className="text-muted-foreground text-sm">{item.how}</span>
          </li>
        ))}
      </ul>

      <GuideCallout tone="warning" title="You are the review step now.">
        <p>
          Only publish material you have the right to use, and never upload a
          photo that identifies a real child.
        </p>
      </GuideCallout>

      <GuideCallout
        tone="info"
        title="AI drafts made before Gemini went away still work."
      >
        <p>
          Reviewing in the AI Queue does not call the model. Approving one
          publishes it straight away, so edit first if it needs changes.
        </p>
      </GuideCallout>

      <details className="group rounded-(--radius) border border-border bg-card">
        <summary className="focus-ring flex min-h-11 cursor-pointer items-center rounded-(--radius) px-3 font-medium text-foreground text-sm">
          Advanced: bulk entry through the API reference
        </summary>
        <div className="flex flex-col gap-3 border-border border-t p-3 text-sm">
          <p className="max-w-prose text-muted-foreground">
            Every form maps onto a JSON endpoint, documented at{" "}
            <code className="font-mono text-foreground">/docs</code> on the API
            (always available locally; in production only with{" "}
            <code className="font-mono text-foreground">
              ENABLE_API_DOCS=true
            </code>
            ). Bodies are validated against the same rules as the forms. Media
            must still be uploaded through Media first.
          </p>
          <dl className="flex flex-col divide-y divide-border rounded-(--radius) border border-border">
            {ENDPOINTS.map(([purpose, endpoint]) => (
              <div
                key={endpoint}
                className="grid gap-1 px-3 py-2 md:grid-cols-[14rem_minmax(0,1fr)]"
              >
                <dt className="text-muted-foreground">{purpose}</dt>
                <dd className="break-all font-mono text-foreground text-xs">
                  {endpoint}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </div>
  );
}
