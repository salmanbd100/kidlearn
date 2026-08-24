"use client";

import { LOCALES, type Locale } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";

/**
 * The English / Bangla switch every content form carries (FR-I18N-01).
 *
 * A local pair of buttons rather than shadcn's `Tabs`, which is not in
 * `packages/ui/src/primitives` — the library has `button`, `dialog`, `input`,
 * `label`, `select` and `textarea` and nothing else. Two buttons and a value is
 * not worth copying a Radix primitive in for, and `general.md §3` says reuse
 * before adding.
 *
 * **They are toggle buttons, not ARIA tabs.** An earlier version wore
 * `role="tablist"` / `role="tab"`, which promises a widget this markup does not
 * implement: no `tabpanel`, no `aria-controls`, no roving `tabindex`, no
 * arrow-key navigation. A screen reader was told "tab 1 of 2" and then could not
 * find the panel. `aria-pressed` describes what these actually are, and the
 * native focus order already works (design.md §7). Wire the full pattern here if
 * a Radix `Tabs` ever lands in `primitives/`.
 *
 * **Both panels stay mounted**, so switching locales cannot lose a half-typed
 * translation and the server receives both — which it requires. The inactive one
 * is `hidden`, which makes its fields unfocusable, so nothing inside may carry
 * `required`: the browser would refuse to submit a form it cannot focus the
 * invalid field in, silently. The forms validate both locales themselves and
 * switch `active` to the one at fault — which is why this is controlled.
 */
const LABELS: Record<Locale, string> = { en: "English", bn: "Bangla" };

export function LocaleTabs({
  active,
  onActiveChange,
  render,
}: {
  active: Locale;
  onActiveChange: (locale: Locale) => void;
  render: (locale: Locale, isActive: boolean) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {LOCALES.map((locale) => (
          <Button
            key={locale}
            type="button"
            aria-pressed={locale === active}
            variant={locale === active ? "default" : "outline"}
            onClick={() => onActiveChange(locale)}
          >
            {LABELS[locale]}
          </Button>
        ))}
      </div>

      {LOCALES.map((locale) => (
        <div key={locale} hidden={locale !== active}>
          {render(locale, locale === active)}
        </div>
      ))}
    </div>
  );
}

export { LABELS as LOCALE_LABELS };
