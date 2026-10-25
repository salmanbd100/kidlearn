"use client";

import { siteResources } from "@kidlearn/i18n/site";
import { GuideFacts } from "@/features/site/guide/GuideFacts";
import {
  GuideLayout,
  type GuideSection,
} from "@/features/site/guide/GuideLayout";
import { GuideSteps } from "@/features/site/guide/GuideSteps";
import { type GuideTab, GuideTabs } from "@/features/site/guide/GuideTabs";
import { GuideText } from "@/features/site/guide/GuideText";

/** `<prefix>.p1`, `.p2`, … in order, read from the English copy; the i18n parity test keeps Bangla in step. */
function paragraphKeys(prefix: string): string[] {
  let node: unknown = siteResources.en;
  for (const part of prefix.split(".")) {
    node =
      typeof node === "object" && node !== null
        ? Reflect.get(node, part)
        : undefined;
  }
  if (typeof node !== "object" || node === null) {
    throw new Error(`No site copy at ${prefix}`);
  }
  return Object.keys(node)
    .filter((key) => /^p\d+$/.test(key))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    .map((key) => `${prefix}.${key}`);
}

/** A tab of plain paragraphs, read from `parents.<group>.<id>.tab` and every `.p<n>` beside it. */
function textTab(group: string, id: string): GuideTab {
  const prefix = `parents.${group}.${id}`;
  return {
    id,
    labelKey: `${prefix}.tab`,
    content: paragraphKeys(prefix).map((key) => (
      <GuideText key={key} i18nKey={key} />
    )),
  };
}

const CHILD_DAY_TABS: readonly GuideTab[] = [
  textTab("day", "lessons"),
  textTab("day", "quiz"),
  textTab("day", "stories"),
  textTab("day", "rewards"),
];

const PROGRESS_TABS: readonly GuideTab[] = [
  textTab("progress", "dashboard"),
  textTab("progress", "reports"),
];

const SAFETY_TABS: readonly GuideTab[] = [
  textTab("safety", "data"),
  textTab("safety", "screens"),
  textTab("safety", "content"),
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

const QUESTIONS = ["wrongAnswer", "twoChildren", "seeAi", "offline"];

export const PARENT_GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: "getting-started",
    titleKey: "parents.start.title",
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
