import type { Locale } from "@kidlearn/types";
import { z } from "zod";

/** An object with exactly the requested locales as required string keys. */
export function localized(
  languages: readonly Locale[],
  description: string,
  max?: number,
) {
  const value =
    max === undefined ? z.string().min(1) : z.string().min(1).max(max);
  const shape = Object.fromEntries(
    languages.map((language) => [language, value]),
  );
  return z.object(shape).strict().describe(description);
}
