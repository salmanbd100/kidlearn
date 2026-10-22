import Link from "next/link";
import { ADMIN_ROUTES } from "@/features/admin/shell/admin-routes";
import { CopyBlock } from "./CopyBlock";
import { GuideCallout } from "./GuideCallout";
import { type GuideStep, GuideSteps } from "./GuideSteps";

const STEPS: GuideStep[] = [
  {
    title: "Create a token",
    body: "AI assistants → Create token. Name it after the device and app, so you know which one to revoke. Copy it straight away — it is shown once.",
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

      <p className="text-sm">
        <Link className="underline" href={ADMIN_ROUTES.aiAssistants}>
          Open AI assistants
        </Link>
      </p>

      <CopyBlock label="Something to ask your assistant" text={PROMPT} />
      <CopyBlock label="After a rejection" text={RETRY_PROMPT} />

      <GuideCallout tone="warning" title="Read the Bangla yourself.">
        <p>
          Whichever model wrote it, a fluent reader checks the Bangla before
          approval. The provenance line on each draft says which assistant wrote
          it — it is the assistant&rsquo;s own claim, so treat it as a label.
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
