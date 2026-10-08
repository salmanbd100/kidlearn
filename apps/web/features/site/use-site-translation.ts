"use client";

import { SITE_NAMESPACE, siteResources } from "@kidlearn/i18n/site";
import { useTranslation } from "react-i18next";

/**
 * `useTranslation` for the public site's copy, which is added to the instance here rather than with the
 * app's other namespaces, so the guides reach a bundle only through a site page importing this.
 */
export function useSiteTranslation() {
  const { i18n } = useTranslation();
  for (const [locale, strings] of Object.entries(siteResources)) {
    // Idempotent, so safe in render: it has to land before the first `t` call, on the server too.
    if (!i18n.hasResourceBundle(locale, SITE_NAMESPACE)) {
      i18n.addResourceBundle(locale, SITE_NAMESPACE, strings);
    }
  }
  return useTranslation(SITE_NAMESPACE);
}
