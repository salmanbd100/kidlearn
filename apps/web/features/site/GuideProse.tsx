"use client";

import { SITE_NAMESPACE } from "@kidlearn/i18n";
import { Trans, useTranslation } from "react-i18next";

// Tags a translated paragraph may use: `<code>` for identifiers, `<strong>` for the one sentence that matters.
const INLINE_COMPONENTS = {
  code: (
    <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground" />
  ),
  strong: <strong className="font-bold" />,
};

function Translated({ i18nKey }: { i18nKey: string }) {
  // `t` passed in so the paragraph subscribes to a language switch itself.
  const { t } = useTranslation(SITE_NAMESPACE);
  return <Trans t={t} i18nKey={i18nKey} components={INLINE_COMPONENTS} />;
}

export function GuideText({ i18nKey }: { i18nKey: string }) {
  return (
    <p>
      <Translated i18nKey={i18nKey} />
    </p>
  );
}

export function GuideSteps({ i18nKeys }: { i18nKeys: readonly string[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {i18nKeys.map((key, index) => (
        <li key={key} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2">
          <span
            aria-hidden="true"
            className="font-bold tabular-nums text-muted-foreground"
          >
            {index + 1}.
          </span>
          <span>
            <Translated i18nKey={key} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A term and its explanation, set as a definition list rather than a grid of cards. */
export function GuideFacts({
  items,
}: {
  items: readonly { termKey: string; detailKey: string }[];
}) {
  const { t } = useTranslation(SITE_NAMESPACE);

  return (
    <dl className="flex flex-col gap-6">
      {items.map(({ termKey, detailKey }) => (
        <div key={termKey} className="flex flex-col gap-1">
          <dt className="font-bold">{t(termKey)}</dt>
          <dd className="text-muted-foreground">
            <Translated i18nKey={detailKey} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
