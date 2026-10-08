"use client";

import { LOCALES, type Locale } from "@kidlearn/types";
import { AdminFilterChip } from "@/features/admin/AdminFilterChip";
import { LOCALE_LABELS } from "@/features/admin/admin-labels";

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
      <div className="flex gap-2">
        {LOCALES.map((locale) => (
          <AdminFilterChip
            key={locale}
            isSelected={locale === active}
            onClick={() => onActiveChange(locale)}
          >
            {LOCALE_LABELS[locale]}
          </AdminFilterChip>
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
