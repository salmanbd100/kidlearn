import type { GradeLevelValue, Locale } from "@kidlearn/types";

// How a grade and a language are spelled in the CMS.

export const GRADE_LABELS: Record<GradeLevelValue, string> = {
  NURSERY: "Nursery",
  KG1: "KG-1",
  KG2: "KG-2",
};

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  bn: "Bangla",
};
