import { LOCALES, type Locale } from "@kidlearn/types";
import bnCommon from "../locales/bn/common.json";
import bnLesson from "../locales/bn/lesson.json";
import bnParent from "../locales/bn/parent.json";
import bnSite from "../locales/bn/site.json";
import bnStudent from "../locales/bn/student.json";
import enCommon from "../locales/en/common.json";
import enLesson from "../locales/en/lesson.json";
import enParent from "../locales/en/parent.json";
import enSite from "../locales/en/site.json";
import enStudent from "../locales/en/student.json";

// UI copy for every client, shared so `apps/mobile` reads the same strings (FR-I18N-01).

export const resources = {
  en: {
    common: enCommon,
    parent: enParent,
    student: enStudent,
    lesson: enLesson,
    site: enSite,
  },
  bn: {
    common: bnCommon,
    parent: bnParent,
    student: bnStudent,
    lesson: bnLesson,
    site: bnSite,
  },
} as const;

export type Namespace = keyof (typeof resources)["en"];

export const DEFAULT_NAMESPACE = "common" satisfies Namespace;

/** Own namespace so the dense parent copy can be split out of a child's bundle. */
export const PARENT_NAMESPACE = "parent" satisfies Namespace;

/** Split from `common` so either surface's bundle can be split out later. */
export const STUDENT_NAMESPACE = "student" satisfies Namespace;

/** Lesson player copy, split from `student` — only the player needs it. */
export const LESSON_NAMESPACE = "lesson" satisfies Namespace;

/** The public homepage and guides — long-form copy no app surface needs in its bundle. */
export const SITE_NAMESPACE = "site" satisfies Namespace;

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string | undefined | null): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

/** Falls back to English rather than throwing — a bad cookie must not 500. */
export function toLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
