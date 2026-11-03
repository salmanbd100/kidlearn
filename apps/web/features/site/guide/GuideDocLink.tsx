"use client";

import { ExternalLink } from "../ExternalLink";
import { REPO_DOC_URL } from "../site-routes";
import { useSiteTranslation } from "../use-site-translation";

/** "Read the full document", pointing into the repository's `document/` folder. */
export function GuideDocLink({
  docPath,
}: {
  /** Relative to `document/`, with an optional `#anchor`. */
  docPath: string;
}) {
  const { t } = useSiteTranslation();

  return (
    <p>
      <ExternalLink href={REPO_DOC_URL(docPath)}>
        {t("guide.readFull")}
      </ExternalLink>
    </p>
  );
}
