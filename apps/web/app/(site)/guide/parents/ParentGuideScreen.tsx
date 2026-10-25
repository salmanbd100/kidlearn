"use client";

import { GuideDocLink } from "@/features/site/guide/GuideDocLink";
import { GuideFacts } from "@/features/site/guide/GuideFacts";
import {
  GuideLayout,
  type GuideSection,
} from "@/features/site/guide/GuideLayout";
import { GuideSteps } from "@/features/site/guide/GuideSteps";
import { type GuideTab, GuideTabs } from "@/features/site/guide/GuideTabs";
import { GuideText } from "@/features/site/guide/GuideText";

const MANUAL = "user-journey-manual.md";

/** A tab of plain paragraphs, read from `parents.<group>.<id>.tab` and `.p1`, `.p2`, …. */
function textTab(
  group: string,
  id: string,
  paragraphCount: number,
  docPath: string,
): GuideTab {
  const prefix = `parents.${group}.${id}`;
  const paragraphKeys = Array.from(
    { length: paragraphCount },
    (_, index) => `${prefix}.p${index + 1}`,
  );
  return {
    id,
    labelKey: `${prefix}.tab`,
    content: (
      <>
        {paragraphKeys.map((key) => (
          <GuideText key={key} i18nKey={key} />
        ))}
        <GuideDocLink docPath={docPath} />
      </>
    ),
  };
}

const CHILD_DAY_TABS: readonly GuideTab[] = [
  textTab("day", "lessons", 2, `${MANUAL}#43-the-5-step-lesson-adventure`),
  textTab("day", "quiz", 2, `${MANUAL}#45-the-quiz--low-pressure-by-design`),
  textTab("day", "stories", 2, `${MANUAL}#48-story-library--reader`),
  textTab("day", "rewards", 2, `${MANUAL}#47-badges-characters--streaks`),
];

const PROGRESS_TABS: readonly GuideTab[] = [
  textTab("progress", "dashboard", 2, `${MANUAL}#54-the-dashboard`),
  textTab("progress", "reports", 2, `${MANUAL}#55-weekly-reports`),
  textTab("progress", "screenTime", 2, `${MANUAL}#56-screen-time-controls`),
];

const SAFETY_TABS: readonly GuideTab[] = [
  textTab(
    "safety",
    "data",
    2,
    "project-requirement-details.md#62-safety--privacy-nfr-safe",
  ),
  textTab(
    "safety",
    "screens",
    2,
    "project-requirement-details.md#62-safety--privacy-nfr-safe",
  ),
  textTab(
    "safety",
    "content",
    2,
    `${MANUAL}#7-cross-cutting-how-content-reaches-a-child`,
  ),
];

/** A section of an intro paragraph over tabs, labelled by the section heading. */
function tabbedSection(
  id: string,
  group: string,
  tabs: readonly GuideTab[],
): GuideSection {
  return {
    id,
    titleKey: `parents.${group}.title`,
    content: (
      <>
        <GuideText i18nKey={`parents.${group}.intro`} />
        <GuideTabs id={id} labelledBy={`${id}-title`} tabs={tabs} />
      </>
    ),
  };
}

const QUESTIONS = ["cutOff", "wrongAnswer", "twoChildren", "seeAi", "offline"];

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
  tabbedSection("your-childs-day", "day", CHILD_DAY_TABS),
  {
    id: "parent-area",
    titleKey: "parents.corner.title",
    docPath: `${MANUAL}#52-reaching-the-parent-area`,
    content: (
      <>
        <GuideText i18nKey="parents.corner.p1" />
        <GuideText i18nKey="parents.corner.p2" />
        <GuideText i18nKey="parents.corner.p3" />
      </>
    ),
  },
  tabbedSection("following-progress", "progress", PROGRESS_TABS),
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
  tabbedSection("safety-and-privacy", "safety", SAFETY_TABS),
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
  {
    id: "questions",
    titleKey: "parents.questions.title",
    content: (
      <GuideFacts
        items={QUESTIONS.map((key) => ({
          termKey: `parents.questions.${key}.term`,
          detailKey: `parents.questions.${key}.detail`,
        }))}
      />
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
