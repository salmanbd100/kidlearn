import i18next, { type i18n as I18nInstance } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import bnCommon from "@/locales/bn/common.json";
import bnLesson from "@/locales/bn/lesson.json";
import bnParent from "@/locales/bn/parent.json";
import bnStudent from "@/locales/bn/student.json";
import enCommon from "@/locales/en/common.json";
import enLesson from "@/locales/en/lesson.json";
import enParent from "@/locales/en/parent.json";
import enStudent from "@/locales/en/student.json";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_MINUTES,
  LOCALE_COOKIE_NAME,
  type Locale,
  SUPPORTED_LOCALES,
} from "./locale";

// i18next, with both locales bundled statically (FR-I18N-01).

export const DEFAULT_NAMESPACE = "common";

/**
 * `parent` is a namespace of its own rather than a branch of `common` so that the
 * parent-dashboard copy — dense, formal, and much larger than the kid surface's —
 * can later be split out of the bundle a child's device downloads. Nothing in it
 * is reachable from the Student Portal.
 */
export const PARENT_NAMESPACE = "parent";

/**
 * The Student Portal's copy, split from `common` for the mirror-image reason
 * `parent` is: a child's device has no use for dashboard strings, and the parent
 * dashboard never renders "Who's learning today?". Keeping the two apart is what
 * makes either one splittable out of the other's bundle later.
 */
export const STUDENT_NAMESPACE = "student";

/**
 * The lesson player's own copy (file 16), split from `student` because it is the
 * one student surface a child stays inside for ten minutes: it is where the step
 * labels, the exit confirm and the finish screen live, and the screens that only
 * navigate *to* a lesson have no use for any of it.
 */
export const LESSON_NAMESPACE = "lesson";

const resources = {
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

let browserInstance: I18nInstance | undefined;

/**
 * On the server a fresh instance is built per call: a module-level singleton is
 * shared by every concurrent request in a worker, so one Bangla visitor would
 * flip the language of an English render happening at the same moment.
 */
export function getI18n(locale: Locale = DEFAULT_LOCALE): I18nInstance {
  if (typeof window === "undefined") return createI18n(locale);

  if (browserInstance === undefined) {
    browserInstance = createI18n(locale);
  } else if (browserInstance.language !== locale) {
    void browserInstance.changeLanguage(locale);
  }
  return browserInstance;
}

function createI18n(locale: Locale): I18nInstance {
  const instance = i18next.createInstance();

  if (typeof window !== "undefined") {
    instance.use(LanguageDetector);
  }

  void instance.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    ns: [
      DEFAULT_NAMESPACE,
      PARENT_NAMESPACE,
      STUDENT_NAMESPACE,
      LESSON_NAMESPACE,
    ],
    defaultNS: DEFAULT_NAMESPACE,
    // React escapes for us; double-escaping mangles Bangla punctuation.
    interpolation: { escapeValue: false },
    detection: {
      order: ["cookie"],
      caches: ["cookie"],
      lookupCookie: LOCALE_COOKIE_NAME,
      cookieMinutes: LOCALE_COOKIE_MINUTES,
      cookieOptions: { path: "/", sameSite: "lax" },
    },
    react: { useSuspense: false },
  });

  return instance;
}

/** Test seam — drops the memoised browser instance between specs. */
export function resetI18nForTests(): void {
  browserInstance = undefined;
}
