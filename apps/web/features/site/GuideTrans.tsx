"use client";

import { Trans } from "react-i18next";
import { useSiteTranslation } from "./use-site-translation";

// Tags a translated paragraph may use: `<code>` for identifiers, `<strong>` for the one sentence that matters.
const INLINE_COMPONENTS = {
  code: (
    <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-foreground" />
  ),
  strong: <strong className="font-bold" />,
};

/** One translated passage of guide copy, with the inline tags above and nothing else. */
export function GuideTrans({ i18nKey }: { i18nKey: string }) {
  // `t` passed in so the paragraph subscribes to a language switch itself.
  const { t } = useSiteTranslation();
  return <Trans t={t} i18nKey={i18nKey} components={INLINE_COMPONENTS} />;
}
