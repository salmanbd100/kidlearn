import { LOCALES, type Locale } from "@kidlearn/types";
import bnCommon from "../locales/bn/common.json";
import bnLesson from "../locales/bn/lesson.json";
import bnParent from "../locales/bn/parent.json";
import bnStudent from "../locales/bn/student.json";
import enCommon from "../locales/en/common.json";
import enLesson from "../locales/en/lesson.json";
import enParent from "../locales/en/parent.json";
import enStudent from "../locales/en/student.json";

// The UI copy for every client, in both locales (FR-I18N-01). Out of
// `apps/web` so `apps/mobile` reads the same strings rather than a copy —
// `mobile-app-plan.md §4.1`.

export const resources = {
  en: {
    common: enCommon,
    parent: enParent,
    student: enStudent,
    lesson: enLesson,
  },
  bn: {
    common: bnCommon,
    parent: bnParent,
    student: bnStudent,
    lesson: bnLesson,
  },
} as const;

export type Namespace = keyof (typeof resources)["en"];

export const DEFAULT_NAMESPACE = "common" satisfies Namespace;

/**
 * `parent` is a namespace of its own rather than a branch of `common` so that the
 * parent-dashboard copy — dense, formal, and much larger than the kid surface's —
 * can later be split out of the bundle a child's device downloads. Nothing in it
 * is reachable from the Student Portal.
 */
export const PARENT_NAMESPACE = "parent" satisfies Namespace;

/**
 * The Student Portal's copy, split from `common` for the mirror-image reason
 * `parent` is: a child's device has no use for dashboard strings, and the parent
 * dashboard never renders "Who's learning today?". Keeping the two apart is what
 * makes either one splittable out of the other's bundle later.
 */
export const STUDENT_NAMESPACE = "student" satisfies Namespace;

/**
 * The lesson player's own copy (file 16), split from `student` because it is the
 * one student surface a child stays inside for ten minutes: it is where the step
 * labels, the exit confirm and the finish screen live, and the screens that only
 * navigate *to* a lesson have no use for any of it.
 */
export const LESSON_NAMESPACE = "lesson" satisfies Namespace;

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string | undefined | null): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

/** Falls back to English rather than throwing — a bad cookie must not 500. */
export function toLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
