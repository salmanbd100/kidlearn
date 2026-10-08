import type { TFunction } from "i18next";

/** Joined through i18next: the conjunction and separator are language-specific. */
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
