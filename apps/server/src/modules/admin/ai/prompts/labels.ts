import type { GradeLevel } from "@kidlearn/db";
import type { Locale } from "@kidlearn/types";

// How a grade and a language are spelled to the model.

export const GRADE_LABELS: Record<GradeLevel, string> = {
  NURSERY: "Nursery (ages 3–4)",
  KG1: "KG-1 (ages 4–5)",
  KG2: "KG-2 (ages 5–6)",
};

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  bn: "Bangla",
};
