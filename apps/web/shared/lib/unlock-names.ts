import type { TFunction } from "i18next";

/**
 * "Leo", or "Leo and Mia" — joined through i18next, because the conjunction and
 * the separator are both language-specific.
 *
 * Shared by the lesson celebration and the story finish screen, which now
 * announce the same unlocks: finishing a story runs the same badge and character
 * evaluation a lesson does (FR-GAM-04..05).
 */
export function unlockNames(
  t: TFunction,
  items: ReadonlyArray<{ name: string }>,
): string {
  if (items.length === 1) return items[0].name;
  return t("reward.announce.nameList", {
    first: items
      .slice(0, -1)
      .map((item) => item.name)
      .join(t("reward.announce.nameSeparator")),
    last: items[items.length - 1].name,
  });
}
