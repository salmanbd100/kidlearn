import { Button } from "@kidlearn/ui";
import {
  ArrowRight,
  Hammer,
  type LucideIcon,
  Sparkles,
  Unplug,
} from "lucide-react";
import Link from "next/link";
import { AdminPageHeader } from "@/features/admin/AdminPageHeader";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";
import { AiFlow } from "@/features/admin/guide/AiFlow";
import { ContentTreeDiagram } from "@/features/admin/guide/ContentTreeDiagram";
import { FormatGallery } from "@/features/admin/guide/FormatGallery";
import { GuideCallout } from "@/features/admin/guide/GuideCallout";
import { GuideContents } from "@/features/admin/guide/GuideContents";
import { GuideSection } from "@/features/admin/guide/GuideSection";
import type { GuideSectionId } from "@/features/admin/guide/guide-sections";
import { LessonStepper } from "@/features/admin/guide/LessonStepper";
import { ScreenMap } from "@/features/admin/guide/ScreenMap";
import { StatusSimulator } from "@/features/admin/guide/StatusSimulator";
import { TroubleshootingFinder } from "@/features/admin/guide/TroubleshootingFinder";
import { VisibilityChecker } from "@/features/admin/guide/VisibilityChecker";
import { WithoutGemini } from "@/features/admin/guide/WithoutGemini";
import { WritingTips } from "@/features/admin/guide/WritingTips";

const ROUTES_IN = [
  {
    icon: Sparkles,
    title: "New here?",
    body: "Read sections 1–4 first — about ten minutes, and every later screen makes sense.",
    href: "#mental-model",
  },
  {
    icon: Hammer,
    title: "Building a lesson today?",
    body: "Follow the step-by-step builder in section 5.",
    href: "#build-a-lesson",
  },
  {
    icon: Unplug,
    title: "Gemini unavailable?",
    body: "Section 8: write or paste content by hand and still publish.",
    href: "#without-gemini",
  },
] as const satisfies readonly {
  icon: LucideIcon;
  title: string;
  body: string;
  href: `#${GuideSectionId}`;
}[];

export function CurriculumGuideScreen() {
  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        title="Curriculum guide"
        description="How the curriculum CMS works, how a lesson is put together, and how content reaches children. Every example below is a sandbox — nothing you click here is saved."
        actions={
          <Button asChild>
            <Link href={ADMIN_ROUTES.curriculum}>
              Open curriculum
              <ArrowRight aria-hidden="true" className="size-4!" />
            </Link>
          </Button>
        }
      />

      <ul className="grid gap-3 md:grid-cols-3">
        {ROUTES_IN.map((route) => (
          <li key={route.href}>
            <a
              href={route.href}
              className="focus-ring flex h-full min-h-11 flex-col gap-1.5 rounded-(--radius) border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="flex items-center gap-2 font-medium text-foreground text-sm">
                <route.icon
                  aria-hidden="true"
                  className="size-4 text-primary"
                />
                {route.title}
              </span>
              <span className="text-muted-foreground text-sm">
                {route.body}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <details className="rounded-(--radius) border border-border bg-card p-2 lg:hidden">
        <summary className="focus-ring flex min-h-11 cursor-pointer items-center rounded-(--radius) px-2 font-medium text-foreground text-sm">
          Contents
        </summary>
        <GuideContents className="pt-2" />
      </details>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex min-w-0 flex-col gap-10">
          <GuideSection
            id="mental-model"
            lead="The curriculum is a tree with a theme attached. Choose any part to see what it is for and where it is made."
          >
            <ContentTreeDiagram />
            <GuideCallout
              tone="info"
              title="Three rules that follow from the tree"
            >
              <p>
                Every row has its own status — publishing a lesson does not
                publish its topic, world, activity or quiz.
              </p>
              <p>
                Everything a child reads exists in English and Bangla. The forms
                will not save with either empty.
              </p>
              <p>
                Content is data: adding a lesson never needs a developer — only
                a new kind of activity does.
              </p>
            </GuideCallout>
          </GuideSection>

          <GuideSection
            id="the-screen"
            lead="The Curriculum page is four columns and a detail panel. Choose a numbered part to see what it does."
          >
            <ScreenMap />
          </GuideSection>

          <GuideSection
            id="status-workflow"
            lead="Every subject, topic, lesson, world, activity and quiz moves through the same statuses. The buttons below are the real ones from the CMS — try them."
          >
            <StatusSimulator />
            <GuideCallout
              tone="warning"
              title="Changing something that is live"
            >
              <p>
                Published content cannot be edited. Back to draft → Edit →
                Submit for review → Approve &amp; publish. Between the first and
                last click it is hidden from children, so do it at a quiet time.
              </p>
              <p>
                Slugs never change once created — they are part of the URL of
                anything published.
              </p>
            </GuideCallout>
          </GuideSection>

          <GuideSection
            id="child-visibility"
            lead="Publishing the lesson is not enough. Four conditions must all hold — toggle them to see the result."
          >
            <VisibilityChecker />
            <p className="max-w-prose text-muted-foreground text-sm">
              <span className="font-medium text-foreground">Preview</span>, on a
              selected lesson, shows it with every part whatever that part's
              status — it does not apply these four conditions. A quiz you can
              preview is not live until the quiz itself is published.
            </p>
          </GuideSection>

          <GuideSection
            id="build-a-lesson"
            lead="The full path with no AI at all. Each step needs the one before it."
          >
            <LessonStepper />
          </GuideSection>

          <GuideSection
            id="activities-and-quizzes"
            lead="Both editors validate as you type and preview with the exact component a child sees. Every activity and every question needs spoken audio in both languages — a three-year-old cannot read the instruction."
          >
            <FormatGallery />
          </GuideSection>

          <GuideSection
            id="generating-with-ai"
            lead="The AI tools are a shortcut to a draft, and the server refuses to publish AI content without a recorded human approval. That approval is the publish: approving a job in the AI Queue sends its content live to children at once."
          >
            <AiFlow />
          </GuideSection>

          <GuideSection
            id="without-gemini"
            lead="If the Gemini subscription is unavailable, keep creating and publishing by hand — including content written in another tool."
          >
            <WithoutGemini />
          </GuideSection>

          <GuideSection
            id="writing-for-kids"
            lead="The children are three to six. Most cannot read yet, and all of them are using a phone or tablet."
          >
            <WritingTips />
          </GuideSection>

          <GuideSection
            id="troubleshooting"
            lead="Error messages and surprises, with what they mean and what to do."
          >
            <TroubleshootingFinder />
          </GuideSection>
        </div>

        <aside className="hidden lg:block">
          <GuideContents className="sticky top-6" />
        </aside>
      </div>
    </div>
  );
}
