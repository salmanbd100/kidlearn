"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "../ExternalLink";
import { REPO_DOC_URL } from "../site-routes";
import { useSiteTranslation } from "../use-site-translation";
import { GuideFacts } from "./GuideFacts";
import { GuideTrans } from "./GuideTrans";

/**
 * One engineering decision: what was chosen, why, what it costs, and what else was on the table.
 * Reads `<prefix>.choice`, `.why`, `.tradeoff` and `.alternatives`.
 */
export function GuideDecision({
  prefix,
  docPath,
  children,
}: {
  prefix: string;
  /** Relative to `document/`, with an optional `#anchor`. */
  docPath: string;
  /** A diagram or a paragraph that belongs between the choice and its reasons. */
  children?: ReactNode;
}) {
  const { t } = useSiteTranslation();

  return (
    <>
      <p className="text-xl font-bold leading-snug">
        <GuideTrans i18nKey={`${prefix}.choice`} />
      </p>
      {children}
      <GuideFacts
        items={[
          { termKey: "guide.decision.why", detailKey: `${prefix}.why` },
          {
            termKey: "guide.decision.tradeoff",
            detailKey: `${prefix}.tradeoff`,
          },
          {
            termKey: "guide.decision.alternatives",
            detailKey: `${prefix}.alternatives`,
          },
        ]}
      />
      <p>
        <ExternalLink href={REPO_DOC_URL(docPath)}>
          {t("guide.readFull")}
        </ExternalLink>
      </p>
    </>
  );
}
