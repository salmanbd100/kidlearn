import Link from "next/link";
import { ADMIN_ROUTES } from "@/features/admin/shell/admin-routes";
import { CopyBlock } from "./CopyBlock";
import { GuideCallout } from "./GuideCallout";
import { type GuideStep, GuideSteps } from "./GuideSteps";

const STEPS: GuideStep[] = [
  {
    title: "Create a token",
    body: "AI assistants → Create token. Name it after the device and app, so you know which one to revoke, and pick how long it lasts — 1, 7, 14 or 30 days, 7 by default. Copy it straight away — it is shown once. You can hold up to 10 live tokens.",
  },
  {
    title: "Connect your assistant",
    body: "The same page has the exact snippet for Claude Code, Claude Desktop, Cursor and VS Code, with your token already in it.",
  },
  {
    title: "Ask for content in plain words",
    body: "Name the topic, grade and languages. The assistant reads the curriculum and KidLearn's writing rules itself, writes the lesson, story or quiz, and submits it.",
  },
  {
    title: "Review it in the AI Queue",
    body: "It arrives as a draft labelled with the assistant's name and yours. Approve, edit then approve, or reject with a reason — exactly as for a Gemini draft.",
  },
];

const ASKS: { ask: string; happens: string }[] = [
  {
    ask: "Write a lesson",
    happens:
      "A draft lesson with its titles, scripts and quiz, under the topic and world you name.",
  },
  {
    ask: "Write a story",
    happens: "A draft story with its pages, in the world you name.",
  },
  {
    ask: "Add quiz questions to a lesson",
    happens:
      "Draft questions on that lesson's quiz. Not once the quiz is published.",
  },
  {
    ask: "Show me the curriculum, a lesson, or a world's characters",
    happens:
      "It reads subjects, topics, lessons and character sheets. Nothing about a parent or child is reachable.",
  },
  {
    ask: "Check my drafts",
    happens:
      "Each draft's status, and the reviewer's reason when one was rejected.",
  },
  {
    ask: "Record narration for a draft",
    happens:
      "KidLearn records it with Google Text-to-Speech; the clips wait in the AI Queue like any other.",
  },
  {
    ask: "Draw pictures for a story",
    happens:
      "Only for a story one of your own assistant drafts created, before it is published, and only when the server has the Gemini key.",
  },
];

const LIMITS: { title: string; body: string }[] = [
  {
    title: "Drafts per day",
    body: "Each admin can submit a set number of drafts a day — 30 unless the deployment changes it; the AI assistants page shows the figure. It resets at local midnight and does not use up the Gemini allowance.",
  },
  {
    title: "Broken drafts are never saved",
    body: "A draft that breaks KidLearn's rules is sent back to the assistant with the exact problems, and it fixes and resubmits by itself. Nothing reaches the queue until it passes.",
  },
  {
    title: "No duplicates on retry",
    body: "If a connection drops and the assistant sends the same draft again, you get the first one back, not a second copy.",
  },
];

const PROMPT = `Using the KidLearn tools: read the authoring guide, then write a KG-1 lesson
in English and Bangla for the "Letters" topic about the letter A and the /a/ sound,
with four quiz questions. Submit it as a draft.`;

const RETRY_PROMPT = `Check the status of my KidLearn drafts. For any that were rejected,
read the reviewer's reason, fix exactly that, and submit a new draft.`;

export function OwnAssistant() {
  return (
    <div className="flex flex-col gap-6">
      <GuideCallout
        tone="success"
        title="Your assistant writes drafts. A person still decides."
      >
        <p>
          The assistant can read curriculum names and KidLearn&rsquo;s rules,
          and submit lessons, stories and quiz questions. It cannot approve,
          publish, change published content, or see anything about a family.
          What it writes is checked against the same rules as a Gemini draft
          before it is saved at all.
        </p>
      </GuideCallout>

      <GuideSteps steps={STEPS} />

      <div className="overflow-x-auto rounded-(--radius) border border-border">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium text-foreground">
                Ask it to
              </th>
              <th scope="col" className="px-3 py-2 font-medium text-foreground">
                What happens
              </th>
            </tr>
          </thead>
          <tbody>
            {ASKS.map((row) => (
              <tr key={row.ask} className="border-border border-t">
                <th
                  scope="row"
                  className="px-3 py-2 align-top font-medium text-foreground"
                >
                  {row.ask}
                </th>
                <td className="px-3 py-2 align-top text-muted-foreground">
                  {row.happens}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm">
        <Link className="underline" href={ADMIN_ROUTES.aiAssistants}>
          Open AI assistants
        </Link>
      </p>

      <CopyBlock label="Something to ask your assistant" text={PROMPT} />
      <CopyBlock label="After a rejection" text={RETRY_PROMPT} />

      <ul className="grid gap-3 md:grid-cols-3">
        {LIMITS.map((limit) => (
          <li
            key={limit.title}
            className="flex flex-col gap-2 rounded-(--radius) border border-border bg-card p-4"
          >
            <span className="font-medium text-foreground text-sm">
              {limit.title}
            </span>
            <span className="text-muted-foreground text-sm">{limit.body}</span>
          </li>
        ))}
      </ul>

      <GuideCallout tone="warning" title="Read the Bangla yourself.">
        <p>
          Whichever model wrote it, a fluent reader checks the Bangla before
          approval. Gemini&rsquo;s safety filter does not run on these drafts,
          so your review is the only check KidLearn makes. Each draft carries a
          line such as &ldquo;Written by Claude Code 2.1 (self-reported) via MCP
          · requested by Ayesha&rdquo; — the assistant names itself, so treat
          that part as a label, not proof.
        </p>
      </GuideCallout>

      <GuideCallout tone="warning" title="Treat a token like a password.">
        <p>
          Anyone holding it can submit drafts in your name until it expires.
          Revoke it on the AI assistants page as soon as a laptop is lost or you
          stop using a client — the assistant is cut off on its next call. The
          page shows when each token was last used. Removing your admin account,
          or linking Google sign-in to it, also cuts every token off.
        </p>
      </GuideCallout>

      <GuideCallout tone="info" title="When there is no Gemini key.">
        <p>
          Generate lesson and Generate story are replaced by{" "}
          <strong>Write with your AI assistant</strong>, which opens the AI
          assistants page. Generate questions and Generate pictures disappear —
          ask your assistant for questions, and upload pictures through Media.
          If assistant access is switched off too, content is entered by hand
          (Working without Gemini).
        </p>
      </GuideCallout>

      <GuideCallout tone="info" title="Pictures and narration stay here.">
        <p>
          Chat assistants cannot record narration or hand over image files. Ask
          the assistant to request narration and KidLearn records it with its
          own voices. Illustrations need the Gemini key; without it, upload
          pictures through Media.
        </p>
      </GuideCallout>

      <GuideCallout
        tone="info"
        title="ChatGPT and claude.ai are not supported yet."
      >
        <p>
          They connect with a sign-in flow rather than a token, which is still
          to come. Claude Desktop, Claude Code, Cursor and VS Code work today.
        </p>
      </GuideCallout>
    </div>
  );
}
