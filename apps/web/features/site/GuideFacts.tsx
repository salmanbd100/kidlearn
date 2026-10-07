"use client";

import { GuideTrans } from "./GuideTrans";
import { useSiteTranslation } from "./use-site-translation";

/** A term and its explanation, set as a definition list rather than a grid of cards. */
export function GuideFacts({
  items,
}: {
  items: readonly { termKey: string; detailKey: string }[];
}) {
  const { t } = useSiteTranslation();

  return (
    <dl className="flex flex-col gap-6">
      {items.map(({ termKey, detailKey }) => (
        <div key={termKey} className="flex flex-col gap-1">
          <dt className="font-bold">{t(termKey)}</dt>
          <dd className="text-muted-foreground">
            <GuideTrans i18nKey={detailKey} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
