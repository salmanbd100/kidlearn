"use client";

import { LOCALES, type Locale } from "@kidlearn/types";
import { Button } from "@kidlearn/ui";
import { LOCALE_LABELS } from "@/lib/admin-labels";

/** The English / Bangla switch every content form carries (FR-I18N-01). */
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
            {LOCALE_LABELS[locale]}
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
