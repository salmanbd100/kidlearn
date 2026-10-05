import {
  DEFAULT_LOCALE,
  DEFAULT_NAMESPACE,
  LESSON_NAMESPACE,
  PARENT_NAMESPACE,
  resources,
  STUDENT_NAMESPACE,
} from "@kidlearn/i18n";
import i18next, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { type Locale, SUPPORTED_LOCALES } from "./locale";

// i18next, with both locales bundled statically (FR-I18N-01). The strings live
// in `@kidlearn/i18n`, shared with the mobile app.

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
    react: { useSuspense: false },
  });

  return instance;
}

/** Test seam — drops the memoised browser instance between specs. */
export function resetI18nForTests(): void {
  browserInstance = undefined;
}
