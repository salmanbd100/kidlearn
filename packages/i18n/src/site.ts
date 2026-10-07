import bnSite from "../locales/bn/site.json";
import enSite from "../locales/en/site.json";

// Its own entry point, not part of `resources`: the guides are the bulk of the copy, and importing them
// from the index would put them in every bundle that translates anything, a child's screens included.

export const SITE_NAMESPACE = "site";

export const siteResources = { en: enSite, bn: bnSite } as const;
