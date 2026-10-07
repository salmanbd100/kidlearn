"use client";

import { LifecycleDiagram } from "@/features/site/diagrams/LifecycleDiagram";
import { GuideLayout, type GuideSection } from "@/features/site/GuideLayout";
import { GuideSteps, GuideText } from "@/features/site/GuideProse";

const ADMIN_DOC = "admin-account-guide.md";
const MANUAL = "user-journey-manual.md";

export const ADMIN_GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: "admin-account",
    titleKey: "admins.account.title",
    // Part 1 and Part 2 hold the commands; the guide names them and does not repeat them.
    docPath: `${ADMIN_DOC}#1-what-an-admin-account-actually-is`,
    content: (
      <>
        <GuideText i18nKey="admins.account.p1" />
        <GuideText i18nKey="admins.account.p2" />
      </>
    ),
  },
  {
    id: "workspace",
    titleKey: "admins.workspace.title",
    docPath: `${ADMIN_DOC}#41-the-workspace`,
    content: <GuideText i18nKey="admins.workspace.p1" />,
  },
  {
    id: "curriculum",
    titleKey: "admins.curriculum.title",
    docPath: `${MANUAL}#62-building-the-curriculum`,
    content: (
      <>
        <GuideText i18nKey="admins.curriculum.p1" />
        <GuideText i18nKey="admins.curriculum.p2" />
      </>
    ),
  },
  {
    id: "media",
    titleKey: "admins.media.title",
    docPath: `${MANUAL}#63-media--content-editors`,
    content: <GuideText i18nKey="admins.media.p1" />,
  },
  {
    id: "ai-pipeline",
    titleKey: "admins.ai.title",
    docPath: `${MANUAL}#64-the-ai-generation-pipeline`,
    content: (
      <>
        <GuideText i18nKey="admins.ai.p1" />
        <GuideText i18nKey="admins.ai.p2" />
      </>
    ),
  },
  {
    id: "review-queue",
    titleKey: "admins.review.title",
    docPath: `${ADMIN_DOC}#44-flow-b--reviewing-ai-content-the-important-one`,
    content: (
      <>
        <GuideText i18nKey="admins.review.p1" />
        <GuideSteps
          i18nKeys={[
            "admins.review.approve",
            "admins.review.edit",
            "admins.review.reject",
          ]}
        />
        <GuideText i18nKey="admins.review.p2" />
      </>
    ),
  },
  {
    id: "publishing-lifecycle",
    titleKey: "admins.lifecycle.title",
    docPath: `${MANUAL}#66-publishing-lifecycle`,
    content: (
      <>
        <GuideText i18nKey="admins.lifecycle.p1" />
        <LifecycleDiagram />
        <GuideText i18nKey="admins.lifecycle.p2" />
      </>
    ),
  },
  {
    id: "cannot-do",
    titleKey: "admins.cannot.title",
    docPath: `${ADMIN_DOC}#45-what-an-admin-cannot-do`,
    content: (
      <>
        <GuideText i18nKey="admins.cannot.p1" />
        <GuideSteps
          i18nKeys={[
            "admins.cannot.familyData",
            "admins.cannot.publish",
            "admins.cannot.accounts",
            "admins.cannot.google",
          ]}
        />
      </>
    ),
  },
];

export function AdminGuideScreen() {
  return (
    <GuideLayout
      readerKey="admins.reader"
      titleKey="admins.title"
      leadKey="admins.lead"
      sections={ADMIN_GUIDE_SECTIONS}
    />
  );
}
