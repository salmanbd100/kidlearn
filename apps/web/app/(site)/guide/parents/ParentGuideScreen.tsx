"use client";

import { GuideLayout, type GuideSection } from "@/features/site/GuideLayout";
import { GuideSteps, GuideText } from "@/features/site/GuideProse";

const MANUAL = "user-journey-manual.md";

export const PARENT_GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: "getting-started",
    titleKey: "parents.start.title",
    docPath: `${MANUAL}#51-first-time-setup`,
    content: (
      <>
        <GuideText i18nKey="parents.start.p1" />
        <GuideSteps
          i18nKeys={[
            "parents.start.step1",
            "parents.start.step2",
            "parents.start.step3",
          ]}
        />
        <GuideText i18nKey="parents.start.p2" />
      </>
    ),
  },
  {
    id: "adding-a-child",
    titleKey: "parents.child.title",
    docPath: `${MANUAL}#53-managing-child-profiles`,
    content: (
      <>
        <GuideText i18nKey="parents.child.p1" />
        <GuideText i18nKey="parents.child.p2" />
      </>
    ),
  },
  {
    id: "parent-area",
    titleKey: "parents.corner.title",
    docPath: `${MANUAL}#52-reaching-the-parent-area`,
    content: (
      <>
        <GuideText i18nKey="parents.corner.p1" />
        <GuideText i18nKey="parents.corner.p2" />
      </>
    ),
  },
  {
    id: "dashboard",
    titleKey: "parents.dashboard.title",
    docPath: `${MANUAL}#54-the-dashboard`,
    content: <GuideText i18nKey="parents.dashboard.p1" />,
  },
  {
    id: "weekly-reports",
    titleKey: "parents.reports.title",
    docPath: `${MANUAL}#55-weekly-reports`,
    content: (
      <>
        <GuideText i18nKey="parents.reports.p1" />
        <GuideText i18nKey="parents.reports.p2" />
      </>
    ),
  },
  {
    id: "screen-time",
    titleKey: "parents.screenTime.title",
    docPath: `${MANUAL}#56-screen-time-controls`,
    content: (
      <>
        <GuideText i18nKey="parents.screenTime.p1" />
        <GuideText i18nKey="parents.screenTime.p2" />
      </>
    ),
  },
  {
    id: "language",
    titleKey: "parents.language.title",
    content: (
      <>
        <GuideText i18nKey="parents.language.p1" />
        <GuideText i18nKey="parents.language.p2" />
      </>
    ),
  },
  {
    id: "deleting-your-data",
    titleKey: "parents.delete.title",
    docPath: `${MANUAL}#57-account--data-deletion`,
    content: (
      <>
        <GuideText i18nKey="parents.delete.p1" />
        <GuideText i18nKey="parents.delete.p2" />
      </>
    ),
  },
];

export function ParentGuideScreen() {
  return (
    <GuideLayout
      readerKey="parents.reader"
      titleKey="parents.title"
      leadKey="parents.lead"
      sections={PARENT_GUIDE_SECTIONS}
    />
  );
}
