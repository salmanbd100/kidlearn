"use client";

import { SITE_NAMESPACE } from "@kidlearn/i18n";
import { useTranslation } from "react-i18next";
import { LifecycleDiagram } from "@/features/site/diagrams/LifecycleDiagram";
import { MonorepoDiagram } from "@/features/site/diagrams/MonorepoDiagram";
import { RequestDiagram } from "@/features/site/diagrams/RequestDiagram";
import { ExternalLink } from "@/features/site/ExternalLink";
import { GuideLayout, type GuideSection } from "@/features/site/GuideLayout";
import { GuideFacts, GuideText } from "@/features/site/GuideProse";
import { REPO_DOC_URL } from "@/features/site/site-routes";

const STACK_ROWS = [
  "web",
  "server",
  "data",
  "auth",
  "ai",
  "media",
  "hosting",
  "ci",
] as const;

const FURTHER_READING = [
  { key: "requirements", path: "project-requirement-details.md" },
  { key: "database", path: "database-design.md" },
  { key: "design", path: "design.md" },
  { key: "journeys", path: "user-journey-manual.md" },
  { key: "standards", path: "standards/general.md" },
  { key: "runbook", path: "runbook.md" },
  { key: "mobile", path: "mobile-app-plan.md" },
] as const;

function StackTable() {
  const { t } = useTranslation(SITE_NAMESPACE);

  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">{t("engineering.glance.caption")}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{t("engineering.glance.layerHeading")}</th>
          <th scope="col">{t("engineering.glance.choiceHeading")}</th>
        </tr>
      </thead>
      <tbody>
        {STACK_ROWS.map((row) => (
          <tr
            key={row}
            className="border-foreground/15 border-b last:border-b-0"
          >
            <th
              scope="row"
              className="w-28 py-4 pr-4 align-top font-bold text-muted-foreground sm:w-36"
            >
              {t(`engineering.glance.${row}.layer`)}
            </th>
            <td className="py-4 align-top">
              <span className="block font-bold">
                {t(`engineering.glance.${row}.choice`)}
              </span>
              <span className="block text-muted-foreground">
                {t(`engineering.glance.${row}.why`)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FurtherReading() {
  const { t } = useTranslation(SITE_NAMESPACE);

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

export const ENGINEERING_GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: "at-a-glance",
    titleKey: "engineering.glance.title",
    content: <StackTable />,
  },
  {
    id: "monorepo",
    titleKey: "engineering.monorepo.title",
    docPath: "mobile-app-plan.md",
    content: (
      <>
        <GuideText i18nKey="engineering.monorepo.p1" />
        <MonorepoDiagram />
        <GuideText i18nKey="engineering.monorepo.p2" />
      </>
    ),
  },
  {
    id: "request",
    titleKey: "engineering.request.title",
    docPath: "runbook.md",
    content: (
      <>
        <GuideText i18nKey="engineering.request.p1" />
        <RequestDiagram />
        <GuideText i18nKey="engineering.request.p2" />
      </>
    ),
  },
  {
    id: "content-as-data",
    titleKey: "engineering.content.title",
    docPath: "database-design.md",
    content: (
      <>
        <GuideText i18nKey="engineering.content.p1" />
        <GuideText i18nKey="engineering.content.p2" />
      </>
    ),
  },
  {
    id: "server-authority",
    titleKey: "engineering.server.title",
    docPath: "project-requirement-details.md",
    content: (
      <>
        <GuideText i18nKey="engineering.server.p1" />
        <GuideText i18nKey="engineering.server.p2" />
      </>
    ),
  },
  {
    id: "human-gate",
    titleKey: "engineering.publishing.title",
    docPath: "admin-account-guide.md#42-the-one-rule-behind-every-screen",
    content: (
      <>
        <GuideText i18nKey="engineering.publishing.p1" />
        <LifecycleDiagram />
        <GuideText i18nKey="engineering.publishing.p2" />
      </>
    ),
  },
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
            termKey: "engineering.safety.deletion.term",
            detailKey: "engineering.safety.deletion.detail",
          },
        ]}
      />
    ),
  },
  {
    id: "quality",
    titleKey: "engineering.quality.title",
    docPath: "standards/general.md#5-testing-standards--shared-rules",
    content: (
      <>
        <GuideText i18nKey="engineering.quality.p1" />
        <GuideText i18nKey="engineering.quality.p2" />
        <GuideText i18nKey="engineering.quality.p3" />
      </>
    ),
  },
  {
    id: "shipping",
    titleKey: "engineering.shipping.title",
    docPath: "runbook.md",
    content: (
      <>
        <GuideText i18nKey="engineering.shipping.p1" />
        <GuideText i18nKey="engineering.shipping.p2" />
        <GuideText i18nKey="engineering.shipping.p3" />
      </>
    ),
  },
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
