"use client";

import { ExternalLink } from "@/features/site/ExternalLink";
import { LifecycleDiagram } from "@/features/site/guide/diagrams/LifecycleDiagram";
import { MonorepoDiagram } from "@/features/site/guide/diagrams/MonorepoDiagram";
import { RequestDiagram } from "@/features/site/guide/diagrams/RequestDiagram";
import { GuideDecision } from "@/features/site/guide/GuideDecision";
import { GuideFacts } from "@/features/site/guide/GuideFacts";
import {
  GuideLayout,
  type GuideSection,
} from "@/features/site/guide/GuideLayout";
import { type GuideTab, GuideTabs } from "@/features/site/guide/GuideTabs";
import { GuideText } from "@/features/site/guide/GuideText";
import { REPO_DOC_URL } from "@/features/site/site-routes";
import { useSiteTranslation } from "@/features/site/use-site-translation";

const FURTHER_READING = [
  { key: "requirements", path: "project-requirement-details.md" },
  { key: "ai", path: "ai-integration-guide.md" },
  { key: "authoring", path: "content-authoring-playbook.md" },
  { key: "database", path: "database-design.md" },
  { key: "design", path: "design.md" },
  { key: "journeys", path: "user-journey-manual.md" },
  { key: "standards", path: "standards/general.md" },
  { key: "deployment", path: "deployment/README.md" },
  { key: "runbook", path: "runbook.md" },
  { key: "mobile", path: "mobile-app-plan.md" },
] as const;

const AI_GUIDE = "ai-integration-guide.md";

/** A tab whose panel is one decision, read from `engineering.<group>.<id>.*`. */
function decisionTab(
  group: string,
  id: string,
  docPath: string,
  extra?: GuideTab["content"],
): GuideTab {
  const prefix = `engineering.${group}.${id}`;
  return {
    id,
    labelKey: `${prefix}.tab`,
    content: (
      <GuideDecision prefix={prefix} docPath={docPath}>
        {extra}
      </GuideDecision>
    ),
  };
}

const STACK_TABS: readonly GuideTab[] = [
  decisionTab("stack", "web", "standards/frontend.md"),
  decisionTab("stack", "api", "standards/backend.md"),
  decisionTab("stack", "database", "database-design.md"),
  decisionTab(
    "stack",
    "auth",
    "project-requirement-details.md#51-authentication--parent-accounts-fr-auth",
  ),
  decisionTab("stack", "media", "deployment/04-database-and-services.md"),
  decisionTab("stack", "hosting", "deployment/00-understand.md"),
];

const ARCHITECTURE_TABS: readonly GuideTab[] = [
  decisionTab(
    "architecture",
    "monorepo",
    "mobile-app-plan.md",
    <MonorepoDiagram />,
  ),
  decisionTab("architecture", "request", "runbook.md", <RequestDiagram />),
  decisionTab("architecture", "content", "database-design.md"),
  decisionTab(
    "architecture",
    "authority",
    "project-requirement-details.md#73-architectural-principles",
  ),
];

const AI_TABS: readonly GuideTab[] = [
  decisionTab(
    "ai",
    "overview",
    `${AI_GUIDE}#3-the-big-picture-two-doors-one-gate`,
  ),
  decisionTab(
    "ai",
    "gemini",
    `${AI_GUIDE}#5-door-1--gemini-generation-inside-kidlearn`,
  ),
  decisionTab("ai", "mcp", `${AI_GUIDE}#7-door-2--bring-your-own-ai-over-mcp`),
  decisionTab("ai", "media", `${AI_GUIDE}#6-narration-and-illustrations`),
  decisionTab(
    "ai",
    "review",
    `${AI_GUIDE}#8-the-gate--human-review`,
    <LifecycleDiagram />,
  ),
];

const QUALITY_TABS: readonly GuideTab[] = [
  decisionTab("quality", "tooling", "standards/general.md"),
  decisionTab(
    "quality",
    "tests",
    "standards/general.md#5-testing-standards--shared-rules",
  ),
  decisionTab("quality", "ci", "standards/general.md#6-enforcement-matrix"),
  decisionTab("quality", "releases", "runbook.md"),
];

function FurtherReading() {
  const { t } = useSiteTranslation();

  return (
    <ul className="flex flex-col gap-1">
      {FURTHER_READING.map(({ key, path }) => (
        <li key={key}>
          <ExternalLink href={REPO_DOC_URL(path)}>
            {t(`engineering.further.${key}`)}
          </ExternalLink>
        </li>
      ))}
    </ul>
  );
}

/** A section whose body is an intro paragraph over a set of tabs, labelled by the section heading. */
function tabbedSection(
  id: string,
  group: string,
  tabs: readonly GuideTab[],
): GuideSection {
  return {
    id,
    titleKey: `engineering.${group}.title`,
    content: (
      <>
        <GuideText i18nKey={`engineering.${group}.intro`} />
        <GuideTabs id={id} labelledBy={`${id}-title`} tabs={tabs} />
      </>
    ),
  };
}

export const ENGINEERING_GUIDE_SECTIONS: readonly GuideSection[] = [
  tabbedSection("stack", "stack", STACK_TABS),
  tabbedSection("architecture", "architecture", ARCHITECTURE_TABS),
  tabbedSection("ai", "ai", AI_TABS),
  {
    id: "safety",
    titleKey: "engineering.safety.title",
    content: (
      <GuideFacts
        items={[
          {
            termKey: "engineering.safety.social.term",
            detailKey: "engineering.safety.social.detail",
          },
          {
            termKey: "engineering.safety.links.term",
            detailKey: "engineering.safety.links.detail",
          },
          {
            termKey: "engineering.safety.consent.term",
            detailKey: "engineering.safety.consent.detail",
          },
          {
            termKey: "engineering.safety.aiData.term",
            detailKey: "engineering.safety.aiData.detail",
          },
          {
            termKey: "engineering.safety.deletion.term",
            detailKey: "engineering.safety.deletion.detail",
          },
        ]}
      />
    ),
  },
  tabbedSection("quality", "quality", QUALITY_TABS),
  {
    id: "read-further",
    titleKey: "engineering.further.title",
    content: <FurtherReading />,
  },
];

export function EngineeringGuideScreen() {
  return (
    <GuideLayout
      readerKey="engineering.reader"
      titleKey="engineering.title"
      leadKey="engineering.lead"
      sections={ENGINEERING_GUIDE_SECTIONS}
    />
  );
}
